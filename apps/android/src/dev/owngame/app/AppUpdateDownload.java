package dev.owngame.app;

import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.Locale;

/** Streams a consented GitHub APK into private cache; only verified bytes become installable. */
public final class AppUpdateDownload {
  public interface Progress {void received(long bytes,long total);}
  public interface Cancellation {boolean cancelled();}
  public interface Transport {Response open(String address)throws Exception;}
  public static final class Response implements AutoCloseable {
    public final InputStream input;public final long length;private final Runnable disconnect;
    public Response(InputStream input,long length,Runnable disconnect){this.input=input;this.length=length;this.disconnect=disconnect;}
    public void close()throws IOException{try{input.close();}finally{disconnect.run();}}
  }
  private final Transport transport;
  public AppUpdateDownload(){this(new HttpsTransport());}
  public AppUpdateDownload(Transport transport){this.transport=transport;}
  private static void cancelled(Cancellation token)throws InterruptedIOException{if(token.cancelled()||Thread.currentThread().isInterrupted())throw new InterruptedIOException("Update cancelled");}
  public File download(AppUpdateChecker.Update update,File directory,Progress progress,Cancellation token)throws Exception{
    if(!AppUpdateChecker.allowedApk(update))throw new IOException("Untrusted APK metadata");
    cancelled(token);if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("Update cache unavailable");
    File part=new File(directory,"update.part"),ready=new File(directory,"update.apk");
    if(verified(update,ready,token)){progress.received(update.bytes,update.bytes);return ready;}
    if(ready.exists()&&!ready.delete())throw new IOException("Could not replace cached update");
    if(directory.getUsableSpace()<update.bytes+4L*1024*1024)throw new IOException("Insufficient update storage");
    boolean complete=false;
    try(Response response=transport.open(update.apkUrl)){
      if(response.length>=0&&response.length!=update.bytes)throw new IOException("APK size mismatch");
      MessageDigest digest=MessageDigest.getInstance("SHA-256");long received=0;
      try(FileOutputStream out=new FileOutputStream(part)){
        byte[] buffer=new byte[65536];int n;
        while((n=response.input.read(buffer))!=-1){cancelled(token);received+=n;if(received>update.bytes)throw new IOException("APK too large");out.write(buffer,0,n);digest.update(buffer,0,n);progress.received(received,update.bytes);}
        cancelled(token);if(received!=update.bytes||!hex(digest.digest()).equals(update.sha256))throw new IOException("APK integrity check failed");out.getFD().sync();
      }
      if(!part.renameTo(ready))throw new IOException("Could not commit update");complete=true;return ready;
    }finally{if(part.exists())part.delete();if(!complete)ready.delete();}
  }
  public static boolean verified(AppUpdateChecker.Update update,File file,Cancellation token)throws Exception{
    if(!AppUpdateChecker.allowedApk(update)||!file.isFile()||file.length()!=update.bytes)return false;
    MessageDigest digest=MessageDigest.getInstance("SHA-256");
    try(InputStream in=new FileInputStream(file)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){cancelled(token);digest.update(b,0,n);}}
    return update.sha256.equals(hex(digest.digest()));
  }
  private static String hex(byte[] bytes){StringBuilder result=new StringBuilder();for(byte b:bytes)result.append(String.format(Locale.ROOT,"%02x",b&255));return result.toString();}
  public static final class HttpsTransport implements Transport {
    public Response open(String address)throws Exception{
      if(!address.matches("https://github\\.com/luka2chat/owngame/releases/download/android-v[0-9A-Za-z.-]+/owngame-android-[0-9A-Za-z.-]+\\.apk"))throw new IOException("Untrusted APK source");
      URL url=new URL(address);
      for(int redirects=0;redirects<5;redirects++){
        if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("Update cancelled");
        HttpURLConnection connection=(HttpURLConnection)url.openConnection();boolean handedOff=false;
        connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setUseCaches(false);
        connection.setRequestProperty("Accept-Encoding","identity");connection.setRequestProperty("User-Agent","owngame-android-updater");
        try{
          int status=connection.getResponseCode();
          if(status==301||status==302||status==303||status==307||status==308){
            String location=connection.getHeaderField("Location");if(location==null)throw new IOException("Missing APK redirect");URL next=new URL(url,location);
            if(!AppUpdateChecker.allowedRedirect(next.toString()))throw new IOException("Untrusted APK redirect");url=next;continue;
          }
          if(status!=200)throw new IOException("APK download unavailable");
          Response response=new Response(connection.getInputStream(),connection.getContentLengthLong(),connection::disconnect);handedOff=true;return response;
        }finally{if(!handedOff)connection.disconnect();}
      }
      throw new IOException("Too many APK redirects");
    }
  }
}
