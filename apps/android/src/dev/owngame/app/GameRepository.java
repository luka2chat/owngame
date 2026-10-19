package dev.owngame.app;

import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Public static catalogue and immutable local installs. No account or pairing token. */
public final class GameRepository {
  public static final String ORIGIN="https://owngame.dev";
  public static final int MAX_FILE=25*1024*1024, MAX_GAME=128*1024*1024;
  private static final Object COMMIT_LOCK=new Object();
  public interface Transport { byte[] get(String path,int limit) throws Exception; }
  public interface RangedTransport extends Transport { byte[] range(String path,int start,int count,int total)throws Exception; }
  public interface Progress { void report(int percent); }
  private final File root;
  private final Transport transport;
  public GameRepository(File root){this(root,new HttpsTransport());}
  public GameRepository(File root,Transport transport){this.root=root;this.transport=transport;}

  public static byte[] retryNetwork(Transport source,String path,int limit)throws Exception{
    for(int attempt=0;attempt<3;attempt++){
      if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("Cancelled");
      try{return source.get(path,limit);}
      catch(SocketTimeoutException|SocketException|EOFException e){
        if(attempt==2||Thread.currentThread().isInterrupted())throw e;
        android.util.Log.w("Owngame","Retrying transient download failure ("+(attempt+1)+"/2)");
      }
    }
    throw new IOException("Retry exhausted");
  }
  public static final class HttpsTransport implements RangedTransport {
    private String fullPath;private byte[] fullResponse;
    public byte[] get(String path,int limit)throws Exception{return retryNetwork(this::getOnce,path,limit);}
    private byte[] getOnce(String path,int limit)throws Exception{return request(path,limit,-1,0);}
    public byte[] range(String path,int start,int count,int total)throws Exception{
      byte[] result=path.equals(fullPath)&&fullResponse!=null?sliceFullResponse(fullResponse,start,count,total):retryNetwork((p,l)->request(p,l,start,total),path,count);
      if(start+count==total){fullPath=null;fullResponse=null;}return result;
    }
    private byte[] request(String path,int limit,int start,int total)throws Exception{
      validateRoute(path);URL url=new URL(ORIGIN+path);
      for(int redirects=0;redirects<4;redirects++){
        HttpURLConnection c=(HttpURLConnection)url.openConnection();
        c.setConnectTimeout(10000);c.setReadTimeout(20000);c.setInstanceFollowRedirects(false);
        c.setRequestProperty("Accept-Encoding","identity");c.setRequestProperty("Cache-Control",start<0?"no-cache":"max-age=31536000");
        if(start>=0)c.setRequestProperty("Range","bytes="+start+"-"+(start+limit-1));
        try{
          int code=c.getResponseCode();
          if(code==301||code==302||code==303||code==307||code==308){
            String location=c.getHeaderField("Location");if(location==null)throw new IOException("Missing redirect");
            URL next=new URL(url,location);validateRedirect(url,next);url=next;continue;
          }
          if(start>=0){
            if(code==200){
              // Some CDN representations ignore Range. Bound and cache the full response once.
              byte[] full=read(c.getInputStream(),total);byte[] part=sliceFullResponse(full,start,limit,total);fullPath=path;fullResponse=full;return part;
            }
            if(code!=206)throw new IOException("Range HTTP "+code);validateRange(c.getHeaderField("Content-Range"),start,limit,total);
          }
          else if(code!=200)throw new IOException("HTTP "+code);
          long length=c.getContentLengthLong();if(length>limit)throw new IOException("File too large");
          return read(c.getInputStream(),limit);
        }finally{c.disconnect();}
      }
      throw new IOException("Too many redirects");
    }
  }
  public static byte[] sliceFullResponse(byte[] full,int start,int count,int total)throws Exception{
    if(full.length!=total||total<=0||total>MAX_FILE||start<0||count<=0||(long)start+count>total)throw new IOException("Invalid full range response");
    return Arrays.copyOfRange(full,start,start+count);
  }
  public static void validateRange(String header,int start,int count,int total)throws Exception{
    if(start<0||count<=0||total<=0||(long)start+count>total||!("bytes "+start+"-"+(start+count-1)+"/"+total).equals(header))throw new IOException("Invalid Content-Range");
  }
  public static byte[] rangedFile(RangedTransport source,String path,int size,File partial,Progress progress)throws Exception{
    if(size<=0||size>MAX_FILE)throw new IOException("Invalid file size");
    if(partial.exists()&&partial.length()>size&&!partial.delete())throw new IOException("Invalid partial file");
    partial.getParentFile().mkdirs();int offset=partial.exists()?(int)partial.length():0;progress.report(offset);
    try(FileOutputStream out=new FileOutputStream(partial,true)){
      while(offset<size){
        if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("Cancelled");
        int count=Math.min(64*1024,size-offset);byte[] chunk=source.range(path,offset,count,size);
        if(chunk.length!=count)throw new IOException("Incomplete range");out.write(chunk);out.getFD().sync();offset+=count;progress.report(offset);
      }
    }
    return read(new FileInputStream(partial),size);
  }
  public static void validateRedirect(URL from,URL to)throws Exception{
    if(!"https".equals(to.getProtocol())||!"owngame.dev".equals(to.getHost())||to.getPort()!=-1||to.getUserInfo()!=null||to.getQuery()!=null||to.getRef()!=null)throw new IOException("Untrusted redirect");
    // Pages only needs index.html -> directory. Never follow redirects out of this file's directory.
    String path=from.getPath();String directory=path.substring(0,path.lastIndexOf('/')+1);
    if(!to.getPath().equals(directory)||!path.endsWith("/index.html"))throw new IOException("Unexpected redirect");
  }
  public static void validateRoute(String p)throws Exception{
    if(p==null||!p.startsWith("/")||p.startsWith("//")||p.contains("%")||p.contains("?")||p.contains("#"))throw new IOException("Invalid public URL");
    safe(p.substring(1));
  }
  public static void safe(String p)throws Exception{
    if(p==null||p.isEmpty()||p.length()>512||p.startsWith("/")||p.contains("\\")||p.contains("%")||p.contains("?")||p.contains("#")||p.contains(":"))throw new IOException("Invalid path");
    for(String s:p.split("/",-1))if(s.isEmpty()||s.equals(".")||s.equals(".."))throw new IOException("Invalid path");
  }
  private static File within(File base,String path)throws Exception{safe(path);File f=new File(base,path);if(!f.getCanonicalPath().startsWith(base.getCanonicalPath()+File.separator))throw new IOException("Outside game");return f;}
  public static byte[] read(InputStream input,int max)throws Exception{try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1){if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("Cancelled");if(out.size()+n>max)throw new IOException("Size limit");out.write(b,0,n);}return out.toByteArray();}}
  public static String sha(byte[] bytes)throws Exception{StringBuilder s=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))s.append(String.format(Locale.ROOT,"%02x",b&255));return s.toString();}
  private static String text(byte[] b){return new String(b,StandardCharsets.UTF_8);}
  private static byte[] bytes(String s){return s.getBytes(StandardCharsets.UTF_8);}
  private static JSONObject copy(JSONObject o)throws Exception{return new JSONObject(o.toString());}
  private static void save(File file,byte[] data)throws Exception{
    file.getParentFile().mkdirs();AtomicFile atomic=new AtomicFile(file);FileOutputStream out=null;
    try{out=atomic.startWrite();out.write(data);atomic.finishWrite(out);}catch(Exception e){if(out!=null)atomic.failWrite(out);throw e;}
  }
  private byte[] readAtomic(File f,int max)throws Exception{return read(new AtomicFile(f).openRead(),max);}
  private JSONArray array(String name)throws Exception{File f=new File(root,name);return f.exists()||new File(f+".bak").exists()?new JSONArray(text(readAtomic(f,2*1024*1024))):new JSONArray();}
  public JSONArray installed()throws Exception{synchronized(COMMIT_LOCK){return array("catalog.json");}}
  public JSONObject installed(String id)throws Exception{return find(installed(),id);}
  private static JSONObject find(JSONArray all,String id)throws Exception{for(int i=0;i<all.length();i++)if(id.equals(all.getJSONObject(i).getString("id")))return all.getJSONObject(i);return null;}
  private static void identity(String id,String version)throws Exception{if(!id.matches("[a-z0-9][a-z0-9-]{0,63}")||!version.matches("[a-f0-9]{64}"))throw new IOException("Invalid game identity");}
  private JSONObject validateItem(JSONObject item)throws Exception{
    String id=item.getString("id"),version=item.getString("version");identity(id,version);
    String prefix="/games/"+id+"/"+version+"/",entry=item.getString("entry"),manifest=item.getString("manifest");
    if(!entry.startsWith(prefix)||!manifest.equals(prefix+"manifest.json"))throw new IOException("Invalid game URLs");safe(entry.substring(prefix.length()));validateRoute(entry);
    String title=item.getString("title"),description=item.getString("description");long size=item.getLong("bytes");
    if(title.isEmpty()||title.length()>160||description.length()>2000||size<=0||size>MAX_GAME)throw new IOException("Invalid game metadata");
    JSONObject clean=new JSONObject();for(String key:new String[]{"id","version","title","description","entry","manifest","bytes"})clean.put(key,item.get(key));
    clean.put("category",item.optString("category","其他"));return clean;
  }
  public void refresh()throws Exception{
    JSONArray response=new JSONArray(text(transport.get("/catalog.json",2*1024*1024))),clean=new JSONArray();Set<String> ids=new HashSet<>();
    if(response.length()>500)throw new IOException("Catalog too large");
    for(int i=0;i<response.length();i++){JSONObject g=validateItem(response.getJSONObject(i));if(!ids.add(g.getString("id")))throw new IOException("Duplicate game");clean.put(g);}
    synchronized(COMMIT_LOCK){save(new File(root,"remote-catalog.json"),bytes(clean.toString()));}
  }
  public JSONArray list()throws Exception{synchronized(COMMIT_LOCK){
    JSONArray remote=array("remote-catalog.json"),local=installed(),result=new JSONArray();Set<String> ids=new HashSet<>();
    for(int i=0;i<remote.length();i++){
      JSONObject r=remote.getJSONObject(i),old=find(local,r.getString("id")),row=copy(r);String id=r.getString("id");ids.add(id);
      row.put("downloaded",old!=null);row.put("update_available",old!=null&&!old.getString("build_sha256").equals(r.getString("version")));
      if(old!=null){row.put("installed_version",old.getString("build_sha256"));row.put("previous_version",old.optString("previous_version"));}result.put(row);
    }
    for(int i=0;i<local.length();i++){JSONObject old=local.getJSONObject(i);if(ids.contains(old.getString("id")))continue;JSONObject row=copy(old);row.put("downloaded",true);row.put("update_available",false);row.put("unlisted",true);row.put("installed_version",old.getString("build_sha256"));result.put(row);}
    return result;
  }}
  public JSONObject download(String id,Progress progress)throws Exception{
    JSONObject g; synchronized(COMMIT_LOCK){g=find(array("remote-catalog.json"),id);}if(g==null)throw new IOException("Refresh catalog first");g=validateItem(g);
    String version=g.getString("version"),prefix="/games/"+id+"/"+version+"/";
    JSONArray webFiles=new JSONArray(text(transport.get(g.getString("manifest"),2*1024*1024))),files=new JSONArray();Set<String> names=new HashSet<>();StringBuilder canonical=new StringBuilder("[");long total=0;
    if(webFiles.length()==0||webFiles.length()>4096)throw new IOException("Invalid file count");
    for(int i=0;i<webFiles.length();i++){
      JSONObject f=webFiles.getJSONObject(i);String url=f.getString("url"),hash=f.getString("sha256");long size=f.getLong("bytes");
      if(!url.startsWith(prefix))throw new IOException("Outside game manifest");String name=url.substring(prefix.length());safe(name);validateRoute(url);
      if(!names.add(name)||size<0||size>MAX_FILE||!hash.matches("[a-f0-9]{64}"))throw new IOException("Invalid file");total+=size;if(total>MAX_GAME)throw new IOException("Game too large");
      if(i>0)canonical.append(',');canonical.append("{\"bytes\":").append(size).append(",\"path\":").append(JSONObject.quote(name).replace("\\/","/")).append(",\"sha256\":").append(JSONObject.quote(hash)).append('}');
      files.put(new JSONObject().put("path",name).put("sha256",hash).put("bytes",size));
    }
    canonical.append(']');String entry=g.getString("entry").substring(prefix.length());
    if(!sha(bytes(canonical.toString())).equals(version)||!names.contains(entry)||total!=g.getLong("bytes"))throw new IOException("Manifest fingerprint mismatch");
    File base=new File(root,"games/"+id+"/"+version);long complete=0;progress.report(0);
    for(int i=0;i<files.length();i++){
      if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("Cancelled");JSONObject f=files.getJSONObject(i);String name=f.getString("path");File dest=within(new File(base,"files"),name);boolean valid=false;
      if(dest.isFile()&&dest.length()==f.getLong("bytes"))valid=sha(read(new FileInputStream(dest),MAX_FILE)).equals(f.getString("sha256"));
      if(!valid){
        int size=(int)f.getLong("bytes");if(root.getUsableSpace()<(long)size*2+8*1024*1024)throw new IOException("Not enough space");
        File partial=within(new File(base,"partial"),name+".part");final long done=complete,expected=total;
        byte[] data=transport instanceof RangedTransport&&size>64*1024?rangedFile((RangedTransport)transport,prefix+name,size,partial,n->progress.report((int)((done+n)*100/expected))):transport.get(prefix+name,size);
        if(data.length!=size||!sha(data).equals(f.getString("sha256"))){partial.delete();throw new IOException("Game fingerprint mismatch");}
        save(dest,data);partial.delete();
      }
      complete+=f.getLong("bytes");progress.report((int)(complete*100/total));
    }
    JSONObject delivery=new JSONObject().put("id",id).put("title",g.getString("title")).put("description",g.getString("description")).put("category",g.optString("category","其他")).put("build_sha256",version).put("entrypoint",entry).put("files",files).put("source","https://owngame.dev");
    synchronized(COMMIT_LOCK){
      JSONArray all=installed();JSONObject old=find(all,id);if(old!=null){String prev=old.getString("build_sha256").equals(version)?old.optString("previous_version"):old.getString("build_sha256");if(!prev.isEmpty())delivery.put("previous_version",prev);}
      save(new File(base,"delivery.json"),bytes(delivery.toString()));commit(all,delivery);
    }
    return delivery;
  }
  private void commit(JSONArray all,JSONObject delivery)throws Exception{JSONArray updated=new JSONArray();for(int i=0;i<all.length();i++)if(!all.getJSONObject(i).getString("id").equals(delivery.getString("id")))updated.put(all.getJSONObject(i));updated.put(delivery);save(new File(root,"catalog.json"),bytes(updated.toString()));}
  public void rollback(String id)throws Exception{synchronized(COMMIT_LOCK){
    JSONArray all=installed();JSONObject current=find(all,id);if(current==null)throw new IOException("Game not installed");String version=current.optString("previous_version");identity(id,version);
    File base=new File(root,"games/"+id+"/"+version);JSONObject previous=new JSONObject(text(readAtomic(new File(base,"delivery.json"),2*1024*1024)));
    if(!id.equals(previous.getString("id"))||!version.equals(previous.getString("build_sha256")))throw new IOException("Invalid previous install");
    JSONArray files=previous.getJSONArray("files");for(int i=0;i<files.length();i++){JSONObject f=files.getJSONObject(i);File file=within(new File(base,"files"),f.getString("path"));if(file.length()!=f.getLong("bytes")||!sha(read(new FileInputStream(file),MAX_FILE)).equals(f.getString("sha256")))throw new IOException("Previous version damaged");}
    previous.remove("previous_version");commit(all,previous);
  }}
}
