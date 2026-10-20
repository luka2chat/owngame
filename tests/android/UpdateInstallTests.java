package dev.owngame.tests;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.provider.OpenableColumns;
import android.database.Cursor;
import dev.owngame.app.*;
import org.json.*;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;
import java.lang.reflect.*;

/** Tests the real APK parser and read-only provider without installing a package. */
public final class UpdateInstallTests extends Instrumentation {
  interface Check{void run()throws Exception;}
  JSONArray results=new JSONArray();Bundle args;
  void test(String name,Check check){try{check.run();results.put(new JSONObject().put("name",name).put("passed",true));}catch(Throwable e){try{results.put(new JSONObject().put("name",name).put("passed",false).put("error",e.toString()));}catch(Exception ignored){}}}
  static void yes(boolean b)throws Exception{if(!b)throw new Exception("Assertion failed");}
  static void rejects(Check check)throws Exception{boolean rejected=false;try{check.run();}catch(Exception expected){rejected=true;}yes(rejected);}
  @Override public void onCreate(Bundle args){super.onCreate(args);this.args=args;start();}
  @Override public void onStart(){try{runTests();}catch(Exception e){test("harness",()->{throw e;});}Bundle output=new Bundle();output.putString("results",results.toString());boolean ok=true;for(int i=0;i<results.length();i++)if(!results.optJSONObject(i).optBoolean("passed"))ok=false;finish(ok?-1:0,output);}
  AppUpdateChecker.Update update(File apk)throws Exception{
    String version=args.getString("version");MessageDigest digest=MessageDigest.getInstance("SHA-256");
    try(InputStream in=new FileInputStream(apk)){byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1)digest.update(buffer,0,n);}
    StringBuilder hash=new StringBuilder();for(byte b:digest.digest())hash.append(String.format(Locale.ROOT,"%02x",b&255));
    return new AppUpdateChecker.Update(version,Long.parseLong(args.getString("code")),"https://github.com/luka2chat/owngame/releases/tag/android-v"+version,"https://github.com/luka2chat/owngame/releases/download/android-v"+version+"/owngame-android-"+version+".apk",apk.length(),hash.toString(),"中文说明\nEnglish notes");
  }
  static AlertDialog dialog(MainActivity activity,String name)throws Exception{Field field=MainActivity.class.getDeclaredField(name);field.setAccessible(true);return (AlertDialog)field.get(activity);}
  static void until(Check check)throws Exception{long deadline=SystemClock.uptimeMillis()+15000;Throwable failure=null;while(SystemClock.uptimeMillis()<deadline){try{check.run();return;}catch(Throwable e){failure=e;SystemClock.sleep(100);}}throw new Exception("Timed out",failure);}
  void runTests()throws Exception{
    Context context=getTargetContext();File fixture=new File(args.getString("apk"));AppUpdateChecker.Update update=update(fixture);
    test("newer matching-package matching-signer APK passes Android archive checks",()->AppUpdateInstaller.validate(context,fixture,update));
    test("equal or older versions cannot be installed by updater",()->{AppUpdateChecker.Update own=update(new File(context.getApplicationInfo().sourceDir));rejects(()->AppUpdateInstaller.validate(context,new File(context.getApplicationInfo().sourceDir),own));});
    test("wrong version and digest are rejected",()->{
      AppUpdateChecker.Update bad=new AppUpdateChecker.Update(update.versionName,update.versionCode+1,update.releaseUrl,update.apkUrl,update.bytes,update.sha256,"");final AppUpdateChecker.Update wrongCode=bad;rejects(()->AppUpdateInstaller.validate(context,fixture,wrongCode));
      bad=new AppUpdateChecker.Update(update.versionName,update.versionCode,update.releaseUrl,update.apkUrl,update.bytes,(update.sha256.startsWith("a")?"b":"a")+update.sha256.substring(1),"");final AppUpdateChecker.Update wrong=bad;rejects(()->AppUpdateInstaller.validate(context,fixture,wrong));
    });
    test("foreign package and different signing key are rejected",()->{
      File tests=new File(getContext().getApplicationInfo().sourceDir);rejects(()->AppUpdateInstaller.validate(context,tests,update(tests)));
      File wrongSigner=new File(args.getString("wrongSigner"));rejects(()->AppUpdateInstaller.validate(context,wrongSigner,update(wrongSigner)));
    });
    File ready=new File(context.getCacheDir(),"app-updates/update.apk"),backup=new File(context.getCacheDir(),"app-updates/saved-"+UUID.randomUUID()+".apk");ready.getParentFile().mkdirs();boolean existed=ready.exists();if(existed)yes(ready.renameTo(backup));
    try{
      try(InputStream in=new FileInputStream(fixture);OutputStream out=new FileOutputStream(ready)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}
      Intent intent=AppUpdateInstaller.intent(context);Uri uri=intent.getData();ContentResolver resolver=context.getContentResolver();
      test("installer intent grants a content URI read access only",()->{yes(Intent.ACTION_INSTALL_PACKAGE.equals(intent.getAction()));yes("content".equals(uri.getScheme()));yes((intent.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)!=0);yes((intent.getFlags()&Intent.FLAG_GRANT_WRITE_URI_PERMISSION)==0);yes(uri.equals(intent.getClipData().getItemAt(0).getUri()));});
      test("provider can stream exactly the verified APK with display metadata",()->{
        try(InputStream in=resolver.openInputStream(uri)){yes(in.read()=='P'&&in.read()=='K');}
        try(Cursor c=resolver.query(uri,new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE},null,null,null)){yes(c.moveToFirst()&&c.getLong(1)==fixture.length());yes("owngame-update.apk".equals(c.getString(0)));}
      });
      test("provider refuses write access and paths outside the single update APK",()->{
        rejects(()->{try(ParcelFileDescriptor ignored=resolver.openFileDescriptor(uri,"w")){};});
        for(String path:new String[]{"/other.apk","/%2e%2e/files/private","/update.apk?other=true","/update.apk#fragment"})rejects(()->{try(InputStream ignored=resolver.openInputStream(Uri.parse("content://"+context.getPackageName()+".updates"+path))){};});
      });
      test("provider is non-exported and exposes only temporary URI grants",()->{
        android.content.pm.ProviderInfo info=context.getPackageManager().resolveContentProvider(context.getPackageName()+".updates",0);yes(info!=null&&!info.exported&&info.grantUriPermissions);
      });
      SharedPreferences prefs=context.getSharedPreferences("app-updates",Context.MODE_PRIVATE);String previous=prefs.getString("ready",null);
      MainActivity activity=null;ActivityMonitor settings=null,installer=null;
      try{
        JSONObject metadata=new JSONObject().put("version",update.versionName).put("code",update.versionCode).put("page",update.releaseUrl).put("apk",update.apkUrl).put("bytes",update.bytes).put("sha256",update.sha256).put("notes",update.releaseNotes);
        yes(prefs.edit().putString("ready",metadata.toString()).commit());
        activity=(MainActivity)startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));final MainActivity host=activity;
        test("downloaded update is restored into a continue-install prompt",()->{
          until(()->{AlertDialog dialog=dialog(host,"updateDialog");yes(dialog!=null&&dialog.isShowing());yes("继续安装".contentEquals(dialog.getButton(AlertDialog.BUTTON_POSITIVE).getText()));});
        });
        IntentFilter settingFilter=new IntentFilter(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);settingFilter.addDataScheme("package");settings=addMonitor(settingFilter,null,true);
        IntentFilter installFilter=new IntentFilter(Intent.ACTION_INSTALL_PACKAGE);installFilter.addDataScheme("content");installFilter.addDataType("application/vnd.android.package-archive");installer=addMonitor(installFilter,null,true);
        final ActivityMonitor settingMonitor=settings,installMonitor=installer;
        test("native continue action reaches app-specific permission or system installer without a browser",()->{
          runOnMainSync(()->{try{dialog(host,"updateDialog").getButton(AlertDialog.BUTTON_POSITIVE).performClick();}catch(Exception e){throw new RuntimeException(e);}});
          until(()->{AlertDialog permission=dialog(host,"updatePermissionDialog");yes(installMonitor.getHits()==1||(permission!=null&&permission.isShowing()));});
          if(installMonitor.getHits()==0){runOnMainSync(()->{try{dialog(host,"updatePermissionDialog").getButton(AlertDialog.BUTTON_POSITIVE).performClick();}catch(Exception e){throw new RuntimeException(e);}});until(()->yes(settingMonitor.getHits()==1));}
          yes(ready.isFile());yes(prefs.getString("ready",null)!=null);
        });
      }finally{
        if(settings!=null)removeMonitor(settings);if(installer!=null)removeMonitor(installer);
        if(activity!=null){final MainActivity host=activity;runOnMainSync(host::finish);waitForIdleSync();}
        if(previous==null)prefs.edit().remove("ready").commit();else prefs.edit().putString("ready",previous).commit();
      }

    }finally{ready.delete();if(existed)yes(backup.renameTo(ready));}
  }
}
