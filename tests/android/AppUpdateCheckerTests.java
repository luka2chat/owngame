package dev.owngame.tests;

import dev.owngame.app.AppUpdateChecker;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

public final class AppUpdateCheckerTests {
  interface Check { void run() throws Exception; }
  static int passed=0;
  static void test(String name,Check check)throws Exception{check.run();passed++;System.out.println("PASS "+name);}
  static void yes(boolean value){if(!value)throw new AssertionError("Check failed");}
  static void rejects(Check check)throws Exception{boolean failed=false;try{check.run();}catch(Exception expected){failed=true;}yes(failed);}
  static byte[] bytes(String value){return value.getBytes(StandardCharsets.UTF_8);}
  static String hash(byte[] value)throws Exception{StringBuilder b=new StringBuilder();for(byte n:MessageDigest.getInstance("SHA-256").digest(value))b.append(String.format(Locale.ROOT,"%02x",n&255));return b.toString();}
  static final String BASE="https://github.com/luka2chat/owngame/releases";
  static final String SHA="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  static final class Release {
    JSONObject release,manifest;String metadataUrl;byte[] metadata;
    Release(String version,int code,int sdk)throws Exception{
      String tag="android-v"+version,name="owngame-android-"+version+".apk";metadataUrl=BASE+"/download/"+tag+"/release-manifest.json";
      manifest=new JSONObject().put("schema","owngame.android-release.v1").put("version",version).put("version_code",code).put("package","dev.owngame.app").put("min_sdk",sdk)
        .put("assets",new JSONArray().put(new JSONObject().put("name",name).put("bytes",100).put("sha256",SHA)));
      release=new JSONObject().put("tag_name",tag).put("draft",false).put("prerelease",true).put("html_url",BASE+"/tag/"+tag)
        .put("assets",new JSONArray().put(new JSONObject().put("name",name).put("state","uploaded").put("size",100).put("digest","sha256:"+SHA).put("browser_download_url",BASE+"/download/"+tag+"/"+name)));
      updateMetadata();
    }
    void updateMetadata()throws Exception{
      metadata=bytes(manifest.toString());JSONArray assets=release.getJSONArray("assets");if(assets.length()>1)assets.remove(1);
      assets.put(new JSONObject().put("name","release-manifest.json").put("state","uploaded").put("size",metadata.length).put("digest","sha256:"+hash(metadata)).put("browser_download_url",metadataUrl));
    }
  }
  static final class Fake implements AppUpdateChecker.Transport {
    Map<String,byte[]> responses=new HashMap<>();List<String> calls=new ArrayList<>();
    Fake(Release... releases){JSONArray list=new JSONArray();for(Release r:releases){list.put(r.release);responses.put(r.metadataUrl,r.metadata);}responses.put(AppUpdateChecker.RELEASES_URL,bytes(list.toString()));}
    public byte[] get(String url,int limit)throws Exception{calls.add(url);byte[] value=responses.get(url);if(value==null||value.length>limit)throw new IOException("Unavailable fixture");return value;}
  }
  public static void main(String[] args)throws Exception{
    test("Android Alpha is selected numerically; CLI and drafts are ignored",()->{
      Release old=new Release("0.4.9-alpha",14,26),next=new Release("0.4.14-alpha",19,26),draft=new Release("9.0.0",999,26);draft.release.put("draft",true);
      next.release.put("body","中文说明\nEnglish release notes");Fake f=new Fake(old,next,draft);JSONArray releases=new JSONArray(new String(f.responses.get(AppUpdateChecker.RELEASES_URL),StandardCharsets.UTF_8));
      releases.put(new JSONObject().put("tag_name","v99.0.0").put("draft",false).put("html_url",BASE+"/tag/v99.0.0"));f.responses.put(AppUpdateChecker.RELEASES_URL,bytes(releases.toString()));
      AppUpdateChecker.Update result=new AppUpdateChecker(f).findUpdate(17,34);yes(result.versionCode==19&&result.versionName.equals("0.4.14-alpha")&&result.releaseUrl.equals(BASE+"/tag/android-v0.4.14-alpha"));
      yes(AppUpdateChecker.allowedApk(result)&&result.bytes==100&&result.sha256.equals(SHA)&&result.releaseNotes.contains("English"));
      yes(f.calls.size()==2);for(String url:f.calls)yes(!url.endsWith(".apk"));
    });
    test("equal and older version codes never prompt or downgrade",()->{
      yes(new AppUpdateChecker(new Fake(new Release("0.4.14-alpha",19,26))).findUpdate(19,34)==null);
      yes(new AppUpdateChecker(new Fake(new Release("0.4.14-alpha",19,26))).findUpdate(20,34)==null);
    });
    test("incompatible Android releases fall back to a compatible published version",()->{
      AppUpdateChecker.Update result=new AppUpdateChecker(new Fake(new Release("0.5.0",30,35),new Release("0.4.14-alpha",19,26))).findUpdate(17,26);yes(result.versionCode==19);
    });
    test("missing assets and external repository links are not offered",()->{
      Release missing=new Release("1.0.0",100,26);missing.release.getJSONArray("assets").remove(0);
      Release external=new Release("2.0.0",200,26);external.release.put("html_url","https://example.invalid/release");
      Release moved=new Release("3.0.0",300,26);moved.release.getJSONArray("assets").getJSONObject(0).put("browser_download_url","https://example.invalid/update.apk");
      yes(new AppUpdateChecker(new Fake(missing,external,moved)).findUpdate(17,34)==null);
    });
    test("manifest corruption, wrong package, mismatched version and APK digest fail closed",()->{
      Release corrupt=new Release("0.4.14-alpha",19,26);Fake bad=new Fake(corrupt);bad.responses.put(corrupt.metadataUrl,bytes("{}"));rejects(()->new AppUpdateChecker(bad).findUpdate(17,34));
      for(String key:new String[]{"package","version"}){Release r=new Release("0.4.14-alpha",19,26);r.manifest.put(key,"unexpected");r.updateMetadata();rejects(()->new AppUpdateChecker(new Fake(r)).findUpdate(17,34));}
      Release mismatched=new Release("0.4.14-alpha",19,26);mismatched.release.getJSONArray("assets").getJSONObject(0).put("digest","sha256:"+SHA.replace('a','b'));rejects(()->new AppUpdateChecker(new Fake(mismatched)).findUpdate(17,34));
    });
    test("network and rate-limit failures return control without downloading an APK",()->{
      AppUpdateChecker checker=new AppUpdateChecker((url,limit)->{throw new IOException("Simulated offline or rate limit");});rejects(()->checker.findUpdate(17,34));
    });
    test("redirects stay HTTPS on GitHub; credentials, foreign hosts and ports are rejected",()->{
      yes(AppUpdateChecker.allowedRedirect("https://release-assets.githubusercontent.com/file?signature=public-test"));
      for(String url:new String[]{"http://github.com/file","https://github.com.example.invalid/file","https://user@github.com/file","https://github.com:444/file","https://example.invalid/file"})yes(!AppUpdateChecker.allowedRedirect(url));
      rejects(()->new AppUpdateChecker.HttpsTransport().get("https://example.invalid/releases",100));
    });
    test("semantic version ordering handles numeric patches and Alpha identifiers",()->{
      yes(AppUpdateChecker.compareVersions("0.4.12-alpha","0.4.9-alpha")>0);yes(AppUpdateChecker.compareVersions("0.4.14","0.4.14-alpha")>0);yes(AppUpdateChecker.compareVersions("0.4.14-alpha.10","0.4.14-alpha.2")>0);
    });
    test("bilingual release notes use the device language with a plain-text fallback",()->{
      String notes="### 中文\n\n更新说明\n\n### English\n\nUpdate notes";
      yes(AppUpdateChecker.notesForLanguage(notes,"zh").equals("更新说明"));yes(AppUpdateChecker.notesForLanguage(notes,"en").equals("Update notes"));yes(AppUpdateChecker.notesForLanguage("Legacy notes","zh").equals("Legacy notes"));
    });
    if(args.length>0&&args[0].equals("--live")){
      AppUpdateChecker.Update live=new AppUpdateChecker().findUpdate(0,34);yes(live!=null);System.out.println("LIVE public Android release: "+live.versionName+" ("+live.versionCode+")");
    }
    System.out.println("App update checks: "+passed+" passed");
  }
}
