package dev.owngame.app;

import android.content.*;
import android.content.pm.*;
import android.net.Uri;
import android.os.Build;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;

/** Final package and signer checks are independent of the release metadata. */
public final class AppUpdateInstaller {
  public static void validate(Context context,File apk,AppUpdateChecker.Update update)throws Exception{
    if(!AppUpdateDownload.verified(update,apk,()->false))throw new IOException("APK integrity check failed");
    PackageManager pm=context.getPackageManager();int flags=Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES;
    PackageInfo archive=pm.getPackageArchiveInfo(apk.getPath(),flags),installed=pm.getPackageInfo(context.getPackageName(),flags);
    if(archive==null||!context.getPackageName().equals(archive.packageName)||!update.versionName.equals(archive.versionName)||
      code(archive)!=update.versionCode||code(archive)<=code(installed)||archive.applicationInfo==null||archive.applicationInfo.minSdkVersion>Build.VERSION.SDK_INT)throw new IOException("Incompatible APK package or version");
    if(!signers(archive).equals(signers(installed)))throw new IOException("APK signing identity mismatch");
  }
  private static long code(PackageInfo info){return Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode;}
  private static Set<String> signers(PackageInfo info)throws Exception{
    Signature[] signatures=Build.VERSION.SDK_INT>=28?(info.signingInfo==null?null:info.signingInfo.getApkContentsSigners()):info.signatures;
    if(signatures==null||signatures.length==0)throw new IOException("Missing APK signature");Set<String> result=new HashSet<>();
    for(Signature signature:signatures)result.add(Arrays.toString(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())));return result;
  }
  public static Intent intent(Context context){
    Uri uri=Uri.parse("content://"+context.getPackageName()+".updates/update.apk");
    Intent intent=new Intent(Intent.ACTION_INSTALL_PACKAGE).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    intent.setClipData(ClipData.newRawUri("App update",uri));return intent;
  }
}
