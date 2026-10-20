package dev.owngame.app;

import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** A temporary read grant exposes exactly one verified APK, never a directory. */
public final class UpdateApkProvider extends ContentProvider {
  @Override public boolean onCreate(){return true;}
  private File apk(Uri uri){
    if(!"content".equals(uri.getScheme())||!(getContext().getPackageName()+".updates").equals(uri.getAuthority())||
      !"/update.apk".equals(uri.getEncodedPath())||uri.getQuery()!=null||uri.getFragment()!=null)throw new SecurityException("Invalid update URI");
    return new File(getContext().getCacheDir(),"app-updates/update.apk");
  }
  @Override public String getType(Uri uri){apk(uri);return "application/vnd.android.package-archive";}
  @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{
    if(!"r".equals(mode))throw new SecurityException("Read only");return ParcelFileDescriptor.open(apk(uri),ParcelFileDescriptor.MODE_READ_ONLY);
  }
  @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
    File file=apk(uri);String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;MatrixCursor cursor=new MatrixCursor(columns);Object[] row=new Object[columns.length];
    for(int i=0;i<columns.length;i++){if(OpenableColumns.DISPLAY_NAME.equals(columns[i]))row[i]="owngame-update.apk";else if(OpenableColumns.SIZE.equals(columns[i]))row[i]=file.length();}cursor.addRow(row);return cursor;
  }
  @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
  @Override public int update(Uri uri,ContentValues values,String selection,String[] args){throw new UnsupportedOperationException();}
  @Override public int delete(Uri uri,String selection,String[] args){throw new UnsupportedOperationException();}
}
