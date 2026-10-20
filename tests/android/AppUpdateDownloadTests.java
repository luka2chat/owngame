package dev.owngame.tests;

import dev.owngame.app.*;
import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

public final class AppUpdateDownloadTests {
  interface Check{void run()throws Exception;}
  static int passed=0;
  static void yes(boolean b){if(!b)throw new AssertionError("Check failed");}
  static void test(String name,Check check)throws Exception{check.run();passed++;System.out.println("PASS "+name);}
  static void rejects(Check check)throws Exception{boolean failed=false;try{check.run();}catch(Exception expected){failed=true;}yes(failed);}
  static String hash(byte[] bytes)throws Exception{StringBuilder b=new StringBuilder();for(byte n:MessageDigest.getInstance("SHA-256").digest(bytes))b.append(String.format(Locale.ROOT,"%02x",n&255));return b.toString();}
  static AppUpdateChecker.Update update(byte[] bytes)throws Exception{return new AppUpdateChecker.Update("0.4.16-alpha",21,"https://github.com/luka2chat/owngame/releases/tag/android-v0.4.16-alpha","https://github.com/luka2chat/owngame/releases/download/android-v0.4.16-alpha/owngame-android-0.4.16-alpha.apk",bytes.length,hash(bytes),"中文说明\nEnglish notes");}
  static class Fake implements AppUpdateDownload.Transport{
    byte[] body;long length;int calls;boolean interrupt=false;Fake(byte[] bytes){body=bytes;length=bytes.length;}
    public AppUpdateDownload.Response open(String url){calls++;InputStream in=new ByteArrayInputStream(body);if(interrupt)in=new InputStream(){int count;public int read()throws IOException{if(count++>5)throw new IOException("Network lost");return 1;}};return new AppUpdateDownload.Response(in,length,()->{});}
  }
  static void clean(File dir){File[] files=dir.listFiles();if(files!=null)for(File file:files)file.delete();}
  public static void main(String[] args)throws Exception{
    File directory=Files.createTempDirectory("owngame-update-download-").toFile();byte[] payload=new byte[150000];new Random(42).nextBytes(payload);AppUpdateChecker.Update update=update(payload);
    try{
      test("streamed APK commits only after size and SHA-256 verification",()->{Fake net=new Fake(payload);long[] progress={0};File apk=new AppUpdateDownload(net).download(update,directory,(n,t)->{yes(n<=t);progress[0]=n;},()->false);yes(Arrays.equals(Files.readAllBytes(apk.toPath()),payload));yes(progress[0]==payload.length);yes(!new File(directory,"update.part").exists());});
      test("verified cache is reusable without another network request",()->{Fake net=new Fake(payload);new AppUpdateDownload(net).download(update,directory,(n,t)->{},()->false);yes(net.calls==0);});
      test("corrupt cached bytes are replaced by a verified download",()->{File apk=new File(directory,"update.apk");byte[] bad=payload.clone();bad[0]^=1;Files.write(apk.toPath(),bad);Fake net=new Fake(payload);new AppUpdateDownload(net).download(update,directory,(n,t)->{},()->false);yes(net.calls==1&&AppUpdateDownload.verified(update,apk,()->false));});
      test("truncated oversized and corrupted bodies never become installable",()->{
        for(byte[] bad:new byte[][]{Arrays.copyOf(payload,payload.length-1),Arrays.copyOf(payload,payload.length+1),new byte[payload.length]}){clean(directory);Fake net=new Fake(bad);net.length=-1;rejects(()->new AppUpdateDownload(net).download(update,directory,(n,t)->{},()->false));yes(directory.list().length==0);}
      });
      test("incorrect HTTP content length is rejected before writing APK bytes",()->{clean(directory);Fake net=new Fake(payload);net.length=payload.length+1;rejects(()->new AppUpdateDownload(net).download(update,directory,(n,t)->{},()->false));yes(directory.list().length==0);});
      test("cancelled and interrupted downloads remove partial and ready files",()->{
        clean(directory);boolean[] cancelled={false};rejects(()->new AppUpdateDownload(new Fake(payload)).download(update,directory,(n,t)->cancelled[0]=true,()->cancelled[0]));yes(directory.list().length==0);
        Fake net=new Fake(payload);net.interrupt=true;rejects(()->new AppUpdateDownload(net).download(update,directory,(n,t)->{},()->false));yes(directory.list().length==0);
      });
      test("foreign URLs invalid hashes and oversized metadata are rejected without networking",()->{
        for(AppUpdateChecker.Update bad:new AppUpdateChecker.Update[]{new AppUpdateChecker.Update(update.versionName,21,update.releaseUrl,"https://example.invalid/update.apk",payload.length,update.sha256,""),new AppUpdateChecker.Update(update.versionName,21,update.releaseUrl,update.apkUrl,payload.length,"invalid",""),new AppUpdateChecker.Update(update.versionName,21,update.releaseUrl,update.apkUrl,513L*1024*1024,update.sha256,"")}){Fake net=new Fake(payload);rejects(()->new AppUpdateDownload(net).download(bad,directory,(n,t)->{},()->false));yes(net.calls==0);}
        rejects(()->new AppUpdateDownload.HttpsTransport().open("https://example.invalid/update.apk"));
      });
      test("retry after an interrupted download produces a complete verified APK",()->{clean(directory);Fake net=new Fake(payload);net.interrupt=true;rejects(()->new AppUpdateDownload(net).download(update,directory,(n,t)->{},()->false));net.interrupt=false;File apk=new AppUpdateDownload(net).download(update,directory,(n,t)->{},()->false);yes(AppUpdateDownload.verified(update,apk,()->false));});
    }finally{clean(directory);directory.delete();}
    if(Arrays.asList(args).contains("--live-download")){
      String output=System.getenv("OWNGAME_UPDATE_TEST_OUTPUT");if(output==null)throw new IOException("Set OWNGAME_UPDATE_TEST_OUTPUT to a large-file test directory");
      AppUpdateChecker.Update latest=new AppUpdateChecker().findUpdate(0,34);yes(latest!=null);
      File apk=new AppUpdateDownload().download(latest,new File(output),(n,t)->{},()->false);yes(AppUpdateDownload.verified(latest,apk,()->false));System.out.println("LIVE APK download verified: "+latest.versionName+" ("+latest.bytes+" bytes)");
    }
    System.out.println("App APK download checks: "+passed+" passed");
  }
}
