package dev.owngame.app;

import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Checks public Android releases only. This class never downloads or installs an APK. */
public final class AppUpdateChecker {
  public static final String RELEASES_URL="https://api.github.com/repos/luka2chat/owngame/releases?per_page=100";
  private static final String BASE="https://github.com/luka2chat/owngame/releases";
  private static final String VERSION="[0-9]{1,9}\\.[0-9]{1,9}\\.[0-9]{1,9}(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?";
  public interface Transport { byte[] get(String url,int limit) throws Exception; }
  public static final class Update {
    public final String versionName, releaseUrl, apkUrl, sha256, releaseNotes;
    public final long versionCode, bytes;
    public Update(String version,long code,String page,String apk,long size,String hash,String notes){versionName=version;versionCode=code;releaseUrl=page;apkUrl=apk;bytes=size;sha256=hash;releaseNotes=notes;}
  }
  private static final class Candidate {
    final String version, page, manifest, notes;
    final JSONObject apk, metadata;
    Candidate(String version,String page,String manifest,JSONObject apk,JSONObject metadata,String notes){this.notes=notes.length()>8000?notes.substring(0,8000):notes;this.version=version;this.page=page;this.manifest=manifest;this.apk=apk;this.metadata=metadata;}
  }
  private final Transport transport;
  public AppUpdateChecker(){this(new HttpsTransport());}
  public AppUpdateChecker(Transport transport){this.transport=transport;}

  public Update findUpdate(long installedCode,int deviceSdk) throws Exception {
    JSONArray releases=new JSONArray(new String(transport.get(RELEASES_URL,2*1024*1024),StandardCharsets.UTF_8));
    List<Candidate> candidates=new ArrayList<>();
    for(int i=0;i<releases.length();i++){
      JSONObject release=releases.optJSONObject(i);if(release==null||release.optBoolean("draft",true))continue;
      String tag=release.optString("tag_name"),version=tag.startsWith("android-v")?tag.substring(9):"";
      if(version.length()>64||!version.matches(VERSION))continue;
      String page=BASE+"/tag/"+tag;
      if(!page.equals(release.optString("html_url")))continue;
      JSONObject apk=asset(release,"owngame-android-"+version+".apk",tag),metadata=asset(release,"release-manifest.json",tag);
      if(apk==null||metadata==null||apk.optLong("size")>512L*1024*1024||metadata.optLong("size")>65536)continue;
      candidates.add(new Candidate(version,page,metadata.optString("browser_download_url"),apk,metadata,release.optString("body")));
    }
    candidates.sort((a,b)->compareVersions(b.version,a.version));
    Exception invalid=null;boolean valid=false;
    for(int i=0;i<Math.min(candidates.size(),3);i++){
      Candidate c=candidates.get(i);
      try{
        byte[] bytes=transport.get(c.manifest,65536);
        String digest=c.metadata.optString("digest");
        if(digest.startsWith("sha256:")&&!digest.equals("sha256:"+sha(bytes)))throw new IOException("Manifest digest mismatch");
        JSONObject manifest=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
        if(!"owngame.android-release.v1".equals(manifest.optString("schema"))||!"dev.owngame.app".equals(manifest.optString("package"))||!c.version.equals(manifest.optString("version")))throw new IOException("Invalid Android release manifest");
        long code=manifest.getLong("version_code");int minimum=manifest.getInt("min_sdk");
        if(code<=0||minimum<26)throw new IOException("Invalid Android version");
        JSONArray files=manifest.getJSONArray("assets");boolean matches=false;String apkHash="";
        for(int j=0;j<files.length();j++){
          JSONObject file=files.getJSONObject(j);String hash=file.optString("sha256");
          if(c.apk.optString("name").equals(file.optString("name"))&&file.optLong("bytes")==c.apk.optLong("size")&&hash.matches("[a-f0-9]{64}")){
            String apkDigest=c.apk.optString("digest");
            matches=apkDigest.isEmpty()||apkDigest.equals("sha256:"+hash);if(matches){apkHash=hash;break;}
          }
        }
        if(!matches)throw new IOException("APK metadata mismatch");
        valid=true;if(minimum>deviceSdk)continue;
        return code>installedCode?new Update(c.version,code,c.page,c.apk.optString("browser_download_url"),c.apk.optLong("size"),apkHash,c.notes):null;
      }catch(InterruptedIOException e){throw e;}catch(Exception e){invalid=e;}
    }
    if(!valid&&invalid!=null)throw new IOException("Android update metadata unavailable",invalid);
    return null;
  }
  private static JSONObject asset(JSONObject release,String name,String tag){
    JSONArray assets=release.optJSONArray("assets");if(assets==null)return null;
    for(int i=0;i<assets.length();i++){
      JSONObject item=assets.optJSONObject(i);
      if(item!=null&&name.equals(item.optString("name"))&&"uploaded".equals(item.optString("state"))&&item.optLong("size")>0&&(BASE+"/download/"+tag+"/"+name).equals(item.optString("browser_download_url")))return item;
    }
    return null;
  }
  public static String notesForLanguage(String notes,String language){
    String wanted="zh".equals(language)?"中文":"English";java.util.regex.Matcher headings=java.util.regex.Pattern.compile("(?m)^#{2,3} (中文|English)\\s*$").matcher(notes);
    int begin=-1;
    while(headings.find()){if(begin>=0)return notes.substring(begin,headings.start()).trim();if(wanted.equals(headings.group(1)))begin=headings.end();}
    return (begin>=0?notes.substring(begin):notes).trim();
  }
  public static boolean allowedApk(Update update){
    return update.versionName!=null&&update.versionName.matches(VERSION)&&update.versionName.length()<=64&&
      (BASE+"/download/android-v"+update.versionName+"/owngame-android-"+update.versionName+".apk").equals(update.apkUrl)&&
      update.bytes>0&&update.bytes<=512L*1024*1024&&update.sha256!=null&&update.sha256.matches("[a-f0-9]{64}")&&update.versionCode>0;
  }
  public static int compareVersions(String a,String b){
    String[] aa=a.split("-",2),bb=b.split("-",2),av=aa[0].split("\\."),bv=bb[0].split("\\.");
    for(int i=0;i<3;i++){int n=Integer.compare(Integer.parseInt(av[i]),Integer.parseInt(bv[i]));if(n!=0)return n;}
    if(aa.length==1||bb.length==1)return Integer.compare(bb.length,aa.length);
    String[] ap=aa[1].split("\\."),bp=bb[1].split("\\.");
    for(int i=0;i<Math.min(ap.length,bp.length);i++){
      boolean an=ap[i].matches("[0-9]+"),bn=bp[i].matches("[0-9]+");int n;
      if(an&&bn)n=new java.math.BigInteger(ap[i]).compareTo(new java.math.BigInteger(bp[i]));
      else if(an!=bn)n=an?-1:1;else n=ap[i].compareTo(bp[i]);
      if(n!=0)return n;
    }
    return Integer.compare(ap.length,bp.length);
  }
  private static String sha(byte[] bytes)throws Exception{
    StringBuilder result=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))result.append(String.format(Locale.ROOT,"%02x",b&255));return result.toString();
  }
  public static boolean allowedRedirect(String value){
    try{URI uri=new URI(value);String host=uri.getHost();return "https".equals(uri.getScheme())&&uri.getUserInfo()==null&&(uri.getPort()==-1||uri.getPort()==443)&&Arrays.asList("api.github.com","github.com","release-assets.githubusercontent.com","objects.githubusercontent.com").contains(host);}
    catch(Exception e){return false;}
  }
  public static final class HttpsTransport implements Transport {
    public byte[] get(String address,int limit)throws Exception{
      if(!address.equals(RELEASES_URL)&&!address.matches("https://github\\.com/luka2chat/owngame/releases/download/android-v"+VERSION+"/release-manifest\\.json"))throw new IOException("Untrusted update source");
      URL url=new URL(address);
      for(int redirect=0;redirect<5;redirect++){
        if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("Cancelled");
        HttpURLConnection connection=(HttpURLConnection)url.openConnection();
        connection.setConnectTimeout(5000);connection.setReadTimeout(5000);connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);connection.setRequestProperty("Cache-Control","no-cache");
        connection.setRequestProperty("User-Agent","owngame-android-update-check");
        connection.setRequestProperty("Accept","api.github.com".equals(url.getHost())?"application/vnd.github+json":"application/octet-stream");
        connection.setRequestProperty("Accept-Encoding","identity");
        try{
          int status=connection.getResponseCode();
          if(status==301||status==302||status==303||status==307||status==308){
            String location=connection.getHeaderField("Location");if(location==null)throw new IOException("Missing redirect");
            URL next=new URL(url,location);if(!allowedRedirect(next.toString()))throw new IOException("Untrusted update redirect");url=next;continue;
          }
          if(status!=200)throw new IOException("Update service unavailable");
          if(connection.getContentLengthLong()>limit)throw new IOException("Update metadata too large");
          try(InputStream input=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int count;
            while((count=input.read(buffer))!=-1){if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("Cancelled");if(out.size()+count>limit)throw new IOException("Update metadata too large");out.write(buffer,0,count);}
            return out.toByteArray();
          }
        }finally{connection.disconnect();}
      }
      throw new IOException("Too many update redirects");
    }
  }
}
