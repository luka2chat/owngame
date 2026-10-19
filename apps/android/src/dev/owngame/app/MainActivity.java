package dev.owngame.app;

import android.app.*;
import android.os.*;
import android.graphics.Color;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.drawable.GradientDrawable;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import android.net.Uri;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.ShortcutManager;
import android.content.pm.ShortcutInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.graphics.Path;
import android.graphics.drawable.Icon;
import org.json.*;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
  private boolean standalone(){return this instanceof GameActivity;}
  private FrameLayout root;
  private LinearLayout capsule;
  private Dialog gameMenu;
  private int safeTop=0, safeBottom=0, safeRight=0;
  private WebView library, game;
  private JSONObject playing;
  private final ExecutorService io=Executors.newSingleThreadExecutor();
  private final ExecutorService updateIo=Executors.newSingleThreadExecutor();
  private boolean updateChecking=false, updateResumed=false;
  private long checkedUpdateSession=-1;
  private AppUpdateChecker.Update pendingUpdate;
  private AlertDialog updateDialog, documentDialog;
  private GameRepository repository;
  private volatile String downloadingId="";
  private volatile int downloadPercent=0;
  private boolean initialRefresh=false;
  private volatile boolean syncing=false;
  private static final String APP="https://app.owngame.invalid/";
  private static final String GAME="https://game.owngame.invalid/";
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
    if(Build.VERSION.SDK_INT>=28){WindowManager.LayoutParams lp=getWindow().getAttributes();lp.layoutInDisplayCutoutMode=WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;getWindow().setAttributes(lp);}
    immersive(getWindow());
    WebView.setWebContentsDebuggingEnabled(false);
    repository=new GameRepository(getFilesDir());
    root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(250,245,232));setContentView(root);
    root.setOnApplyWindowInsetsListener((v,insets)->{
      safeTop=0;safeRight=0;safeBottom=0;
      if(Build.VERSION.SDK_INT>=28 && insets.getDisplayCutout()!=null){safeTop=insets.getDisplayCutout().getSafeInsetTop();safeRight=insets.getDisplayCutout().getSafeInsetRight();safeBottom=insets.getDisplayCutout().getSafeInsetBottom();}
      updateSafeArea();return insets;
    });
    if(standalone()){String id=gameId(getIntent());if(id==null||!hasGame(id)){Toast.makeText(this,"游戏尚未下载，请在游戏库中获取",Toast.LENGTH_LONG).show();returnHome();}else open(id);return;}
    library=new WebView(this);configure(library,true);library.addJavascriptInterface(new LibraryBridge(),"Owngame");
    root.addView(library,new FrameLayout.LayoutParams(-1,-1));library.loadUrl(APP+"index.html");
  }
  private void checkAppUpdate(boolean manual){
    if(standalone()||isFinishing()||isDestroyed())return;
    if(updateChecking){if(manual)Toast.makeText(this,"正在检查 App 更新…",Toast.LENGTH_SHORT).show();return;}
    if(updateDialog!=null)return;
    pendingUpdate=null;updateChecking=true;
    if(manual)Toast.makeText(this,"正在检查 App 更新…",Toast.LENGTH_SHORT).show();
    updateIo.execute(()->{
      AppUpdateChecker.Update available=null;boolean failed=false;
      try{
        android.content.pm.PackageInfo info=getPackageManager().getPackageInfo(getPackageName(),0);
        long code=Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode;
        available=new AppUpdateChecker().findUpdate(code,Build.VERSION.SDK_INT);
      }catch(Exception e){failed=true;android.util.Log.w("Owngame","App update check unavailable");}
      final AppUpdateChecker.Update result=available;final boolean unavailable=failed;
      runOnUiThread(()->{
        updateChecking=false;if(isFinishing()||isDestroyed())return;
        if(result!=null){pendingUpdate=result;showPendingUpdate();}
        else if(manual)Toast.makeText(this,unavailable?"暂时无法检查，请稍后重试":"当前没有可用的 App 更新",Toast.LENGTH_LONG).show();
      });
    });
  }
  private void showPendingUpdate(){
    if(!updateResumed||standalone()||playing!=null||pendingUpdate==null||updateDialog!=null||isFinishing()||isDestroyed())return;
    final AppUpdateChecker.Update update=pendingUpdate;String current="";
    try{current=getPackageManager().getPackageInfo(getPackageName(),0).versionName;}catch(Exception ignored){}
    updateDialog=new AlertDialog.Builder(this).setTitle("发现 App 新版本")
      .setMessage("新版本："+update.versionName+"\n当前版本："+current+"\n\n可以前往 GitHub 查看说明并下载更新，也可以暂不更新，继续玩已下载的游戏。")
      .setNegativeButton("暂不更新",null)
      .setPositiveButton("去 GitHub 更新",(dialog,which)->{
        try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(update.releaseUrl)).addCategory(Intent.CATEGORY_BROWSABLE));}
        catch(Exception e){Toast.makeText(this,"无法打开浏览器，请稍后再试",Toast.LENGTH_LONG).show();}
      }).create();
    showImmersiveDialog(updateDialog);
    updateDialog.setOnDismissListener(dialog->{pendingUpdate=null;updateDialog=null;immersive(getWindow());});
  }
  private String gameId(Intent intent){
    Uri u=intent.getData();if(u==null||!"owngame".equals(u.getScheme())||!"game".equals(u.getHost())||u.getQuery()!=null||u.getFragment()!=null)return null;
    String p=u.getPath();if(p==null||!p.matches("/[a-z0-9][a-z0-9-]{0,63}"))return null;return p.substring(1);
  }
  private boolean hasGame(String id){try{JSONArray all=catalog();for(int i=0;i<all.length();i++)if(id.equals(all.getJSONObject(i).optString("id")))return true;}catch(Exception ignored){}return false;}
  private Intent gameIntent(String id){return new Intent(this,GameActivity.class).setAction(Intent.ACTION_VIEW).setData(new Uri.Builder().scheme("owngame").authority("game").appendPath(id).build()).addFlags(Intent.FLAG_ACTIVITY_NEW_DOCUMENT);}
  private void launchGame(String id){if(id==null||!id.matches("[a-z0-9][a-z0-9-]{0,63}")||!hasGame(id))return;startActivity(gameIntent(id));}
  private void returnHome(){startActivity(new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));finishAndRemoveTask();}
  @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(standalone()){
    String id=gameId(intent);if(id==null||!hasGame(id)){Toast.makeText(this,"游戏尚未下载",Toast.LENGTH_SHORT).show();returnHome();return;}
    if(playing==null)open(id);
    else try{JSONObject installed=repository.installed(id);if(installed!=null&&!installed.getString("build_sha256").equals(playing.optString("build_sha256")))reopenInstalled();}catch(Exception ignored){}
  }else if(library!=null)library.evaluateJavascript("window.goHome&&window.goHome()",null);}
  private Bitmap gameIcon(String id){
    Bitmap result=Bitmap.createBitmap(192,192,Bitmap.Config.ARGB_8888);Canvas c=new Canvas(result);Paint p=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
    c.drawColor(Color.rgb(250,245,232));
    if("signal-harbor".equals(id)){try{
      Bitmap bg=BitmapFactory.decodeStream(getAssets().open("art/harbor-background.png"));c.drawBitmap(bg,null,new Rect(0,0,192,192),p);bg.recycle();
      Bitmap tower=BitmapFactory.decodeStream(getAssets().open("art/lighthouse.png"));c.drawBitmap(tower,null,new Rect(58,24,134,173),p);tower.recycle();
      Bitmap signal=BitmapFactory.decodeStream(getAssets().open("art/signal-b.png"));c.drawBitmap(signal,null,new Rect(75,93,117,135),p);signal.recycle();
    }catch(Exception ignored){p.setColor(Color.rgb(12,66,83));c.drawCircle(96,96,58,p);}}
    else if("unlock-bolts-mobile".equals(id)){int[] colors={0xffd7826e,0xff83b39b,0xffdcc074};for(int col=0;col<3;col++){float x=52+44*col;p.setColor(0xff91a297);c.drawRect(x-4,40,x+4,151,p);for(int row=0;row<3;row++){float y=65+29*row;Path path=new Path();for(int k=0;k<6;k++){double a=k*Math.PI/3;float xx=x+(float)Math.cos(a)*22,yy=y+(float)Math.sin(a)*15;if(k==0)path.moveTo(xx,yy);else path.lineTo(xx,yy);}path.close();p.setColor(colors[(row+col)%3]);c.drawPath(path,p);}}}
    else{p.setColor(0xffed3b26);c.drawRoundRect(35,35,157,157,24,24,p);p.setColor(Color.WHITE);p.setTextAlign(Paint.Align.CENTER);p.setTextSize(72);p.setFakeBoldText(true);c.drawText("G",96,122,p);}
    return result;
  }
  private void pinGame(){
    if(playing==null)return;ShortcutManager manager=getSystemService(ShortcutManager.class);
    if(manager==null||!manager.isRequestPinShortcutSupported()){Toast.makeText(this,"当前桌面不支持添加快捷方式",Toast.LENGTH_LONG).show();return;}
    String id=playing.optString("id"),title=playing.optString("title");ShortcutInfo shortcut=new ShortcutInfo.Builder(this,"game-"+id).setShortLabel(title.split(" · ")[0]).setLongLabel(title.split(" · ")[0]).setIcon(Icon.createWithAdaptiveBitmap(gameIcon(id))).setIntent(gameIntent(id)).build();
    try{boolean exists=false;for(ShortcutInfo old:manager.getPinnedShortcuts())if(old.getId().equals(shortcut.getId()))exists=true;
      if(exists){manager.updateShortcuts(Collections.singletonList(shortcut));Toast.makeText(this,"桌面快捷方式已添加",Toast.LENGTH_SHORT).show();return;}
      if(!manager.requestPinShortcut(shortcut,null))Toast.makeText(this,"暂时无法添加，请稍后再试",Toast.LENGTH_SHORT).show();
    }catch(Exception e){Toast.makeText(this,"添加失败，请检查桌面快捷方式权限",Toast.LENGTH_LONG).show();}
  }
  private void configure(WebView view, boolean trusted) {
    view.setBackgroundColor(Color.rgb(250,245,232));
    WebSettings s=view.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMediaPlaybackRequiresUserGesture(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportMultipleWindows(true);
    view.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onConsoleMessage(ConsoleMessage m){android.util.Log.i("OwngameWeb",m.message());return false;}
      @Override public boolean onCreateWindow(WebView source,boolean dialog,boolean gesture,Message result){
        if(!gesture)return false;
        // Capture the destination without loading it or giving the new window a native bridge.
        WebView popup=new WebView(MainActivity.this);
        boolean[] released={false};Runnable release=()->{if(!released[0]){released[0]=true;popup.destroy();}};
        popup.setWebViewClient(new WebViewClient(){
          private boolean handled=false;
          @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){
            if(!handled){handled=true;if(!handleNavigation(source,r.getUrl(),trusted,true))source.loadUrl(r.getUrl().toString());source.post(release);}
            return true;
          }
          @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return response(403,"text/plain",new byte[0]);}
        });
        ((WebView.WebViewTransport)result.obj).setWebView(popup);result.sendToTarget();
        // Also release windows that never navigate.
        source.postDelayed(release,10000);return true;
      }
    });
    view.setWebViewClient(new WebViewClient(){
      @Override public void onPageFinished(WebView v,String url){if(trusted){updateSafeArea();if(!initialRefresh){initialRefresh=true;sync();}}}
      @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return handleNavigation(v,r.getUrl(),trusted,r.isForMainFrame()&&r.hasGesture());}
      @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
        try {
          Uri u=r.getUrl();if(!allowed(u,trusted))return response(403,"text/plain",new byte[0]);
          String relative=u.getPath().substring(1);safe(relative);
          if(trusted)return response(200,mime(relative),readAll(getAssets().open(relative),16*1024*1024));
          String[] parts=relative.split("/",3);if(parts.length!=3||!parts[0].matches("[a-z0-9][a-z0-9-]{0,63}")||!parts[1].matches("[a-f0-9]{64}"))throw new Exception("Unknown game");
          File base=new File(getFilesDir(),"games/"+parts[0]+"/"+parts[1]+"/files");File f=contained(base,parts[2]);
          return new WebResourceResponse(mime(relative),"UTF-8",new FileInputStream(f));
        }catch(Exception e){return response(404,"text/plain",new byte[0]);}
      }
    });
    view.setOnLongClickListener(v->true);
  }
  private boolean allowed(Uri u,boolean trusted){return "https".equals(u.getScheme())&&u.getUserInfo()==null&&(u.getPort()==-1||u.getPort()==443)&&(trusted?"app.owngame.invalid":"game.owngame.invalid").equals(u.getHost());}
  private boolean handleNavigation(WebView source,Uri target,boolean trusted,boolean gesture){
    if(allowed(target,trusted)){
      String path=target.getPath();
      if(path!=null&&(path.endsWith(".txt")||path.endsWith(".md"))){if(gesture)showDocument(source,target,trusted);return true;}
      return false;
    }
    // Only a deliberate HTTPS link can leave the offline game. Subresources stay local.
    if(gesture&&"https".equals(target.getScheme())&&target.getHost()!=null&&target.getUserInfo()==null&&
      !"app.owngame.invalid".equals(target.getHost())&&!"game.owngame.invalid".equals(target.getHost())){
      try{startActivity(new Intent(Intent.ACTION_VIEW,target).addCategory(Intent.CATEGORY_BROWSABLE));}
      catch(Exception e){Toast.makeText(this,"无法打开浏览器，请稍后再试",Toast.LENGTH_LONG).show();}
    }
    return true;
  }
  private void showDocument(WebView source,Uri target,boolean trusted){
    final String current=source.getUrl();
    io.execute(()->{
      try{
        String relative=target.getPath().substring(1);safe(relative);byte[] bytes;
        if(trusted)bytes=readAll(getAssets().open(relative),1024*1024);
        else{
          String[] parts=relative.split("/",3);String[] origin=Uri.parse(current).getPath().substring(1).split("/",3);
          if(parts.length!=3||origin.length!=3||!parts[0].equals(origin[0])||!parts[1].equals(origin[1])||
            !parts[0].matches("[a-z0-9][a-z0-9-]{0,63}")||!parts[1].matches("[a-f0-9]{64}"))throw new IOException("Outside current game");
          bytes=readAll(new FileInputStream(contained(new File(getFilesDir(),"games/"+parts[0]+"/"+parts[1]+"/files"),parts[2])),1024*1024);
        }
        final String text=new String(bytes,java.nio.charset.StandardCharsets.UTF_8);
        runOnUiThread(()->{
          if(isFinishing()||isDestroyed()||!current.equals(source.getUrl()))return;
          if(documentDialog!=null)documentDialog.dismiss();
          TextView content=new TextView(this);content.setText(text);content.setTextSize(14);content.setTextColor(Color.rgb(32,34,30));content.setTextIsSelectable(true);content.setPadding(dp(20),dp(12),dp(20),dp(12));
          ScrollView scroll=new ScrollView(this);scroll.addView(content);
          documentDialog=new AlertDialog.Builder(this).setTitle("授权与说明").setView(scroll).setPositiveButton("关闭",null).create();
          showImmersiveDialog(documentDialog);
        });
      }catch(Exception e){runOnUiThread(()->Toast.makeText(this,"说明暂时无法打开，请重新下载游戏后重试",Toast.LENGTH_LONG).show());}
    });
  }
  private WebResourceResponse response(int code,String mime,byte[] bytes){return new WebResourceResponse(mime,"UTF-8",code,code==200?"OK":"Unavailable",Collections.singletonMap("Cache-Control","no-store"),new ByteArrayInputStream(bytes));}
  private static String mime(String p){if(p.endsWith(".html"))return "text/html";if(p.endsWith(".js")||p.endsWith(".mjs"))return "application/javascript";if(p.endsWith(".txt")||p.endsWith(".md"))return "text/plain";if(p.endsWith(".json"))return "application/json";if(p.endsWith(".css"))return "text/css";if(p.endsWith(".wasm"))return "application/wasm";if(p.endsWith(".png"))return "image/png";if(p.endsWith(".jpg")||p.endsWith(".jpeg"))return "image/jpeg";if(p.endsWith(".webp"))return "image/webp";if(p.endsWith(".svg"))return "image/svg+xml";if(p.endsWith(".ttf"))return "font/ttf";return "application/octet-stream";}
  private static void safe(String p)throws Exception{if(p.length()==0||p.startsWith("/")||p.contains("\\"))throw new Exception("Invalid path");for(String s:p.split("/",-1))if(s.isEmpty()||s.equals(".")||s.equals(".."))throw new Exception("Invalid path");}
  private static File contained(File base,String relative)throws Exception{safe(relative);File f=new File(base,relative);if(!f.getCanonicalPath().startsWith(base.getCanonicalPath()+File.separator))throw new Exception("Outside game");return f;}
  private static byte[] readAll(InputStream input,int max)throws Exception{try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1){if(out.size()+n>max)throw new Exception("Size limit");out.write(b,0,n);}return out.toByteArray();}}
  private static String sha(byte[] bytes)throws Exception{byte[] d=MessageDigest.getInstance("SHA-256").digest(bytes);StringBuilder out=new StringBuilder();for(byte b:d)out.append(String.format("%02x",b&255));return out.toString();}
  private static void save(File f,byte[] b)throws Exception{f.getParentFile().mkdirs();File tmp=new File(f.getPath()+".tmp");try(FileOutputStream out=new FileOutputStream(tmp)){out.write(b);out.getFD().sync();}if(!tmp.renameTo(f))throw new Exception("Could not commit file");}
  private JSONArray catalog()throws Exception{return repository.installed();}
  private void notifyStatus(String text){runOnUiThread(()->{if(library!=null&&!isDestroyed())library.evaluateJavascript("window.onStatus&&window.onStatus("+JSONObject.quote(text)+")",null);});}
  private void sync(){
    if(syncing){notifyStatus("正在处理，请稍候…");return;}syncing=true;notifyStatus("正在查看新游戏和更新…");
    io.execute(()->{try{repository.refresh();notifyStatus("游戏库已更新 · 喜欢哪款就下载哪款");}
      catch(Exception e){android.util.Log.w("Owngame","Catalog refresh failed",e);notifyStatus("暂时连不上游戏库，已下载的游戏照常玩");}
      finally{syncing=false;runOnUiThread(()->refreshLibrary());}});
  }
  private void downloadGame(String id){
    if(id==null||!id.matches("[a-z0-9][a-z0-9-]{0,63}"))return;
    if(syncing){notifyStatus("已有下载或刷新正在进行，请稍候");return;}
    syncing=true;downloadingId=id;downloadPercent=0;refreshLibrary();
    io.execute(()->{try{repository.download(id,percent->{downloadPercent=percent;notifyStatus("正在下载 · "+percent+"%");runOnUiThread(()->refreshLibrary());});notifyStatus("下载完成 · 没网络也能玩");}
      catch(Exception e){android.util.Log.w("Owngame","Download failed",e);notifyStatus("下载未完成，点下载可重试；已安装的旧版保留");}
      finally{syncing=false;downloadingId="";runOnUiThread(()->refreshLibrary());}});
  }
  private void rollbackGame(String id){
    if(id==null||!id.matches("[a-z0-9][a-z0-9-]{0,63}")||syncing)return;
    AlertDialog d=new AlertDialog.Builder(this).setTitle("恢复上一版？").setMessage("会校验并恢复手机上保存的上一版。重新打开游戏后生效，收藏和桌面图标保留。").setNegativeButton("取消",null).setPositiveButton("恢复上一版",(dialog,which)->{
      syncing=true;io.execute(()->{try{repository.rollback(id);notifyStatus("已恢复上一版，重新打开游戏即可");}catch(Exception e){notifyStatus("上一版不可用，当前版本保持不变");}finally{syncing=false;runOnUiThread(()->refreshLibrary());}});
    }).create();showImmersiveDialog(d);
  }
  private void reopenInstalled(){
    if(playing==null)return;String id=playing.optString("id");dismissMenu();
    if(game!=null){game.stopLoading();root.removeView(game);game.destroy();game=null;}if(capsule!=null){root.removeView(capsule);capsule=null;}playing=null;open(id);
  }
  private void immersive(Window window){
    window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    if(Build.VERSION.SDK_INT>=30){window.setDecorFitsSystemWindows(false);WindowInsetsController c=window.getInsetsController();if(c!=null){c.hide(WindowInsets.Type.systemBars());c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);}}
  }
  private void updateSafeArea(){
    if(library!=null)library.evaluateJavascript("window.setSafeArea&&window.setSafeArea("+(safeTop/getResources().getDisplayMetrics().density)+","+(safeBottom/getResources().getDisplayMetrics().density)+")",null);
    if(capsule!=null){FrameLayout.LayoutParams lp=(FrameLayout.LayoutParams)capsule.getLayoutParams();lp.topMargin=Math.max(dp(12),safeTop+dp(6));lp.rightMargin=safeRight+dp(12);capsule.setLayoutParams(lp);}
  }
  private void open(String id){try{
    if(game!=null)return;
    JSONArray all=catalog();JSONObject selected=null;for(int i=0;i<all.length();i++)if(all.getJSONObject(i).getString("id").equals(id))selected=all.getJSONObject(i);if(selected==null)return;playing=selected;
    getSharedPreferences("player",MODE_PRIVATE).edit().putLong("played:"+id,System.currentTimeMillis()).apply();
    if(library!=null)library.setVisibility(View.GONE);
    setTaskDescription(new ActivityManager.TaskDescription(playing.optString("title"),gameIcon(id),Color.rgb(250,245,232)));
    game=new WebView(this);configure(game,false);game.addJavascriptInterface(new Haptics(),"OwngameFeedback");root.addView(game,new FrameLayout.LayoutParams(-1,-1));
    capsule=new LinearLayout(this);capsule.setGravity(Gravity.CENTER);capsule.setPadding(dp(2),0,dp(2),0);
    GradientDrawable bg=new GradientDrawable();bg.setColor(Color.argb(175,20,23,26));bg.setCornerRadius(dp(24));bg.setStroke(dp(1),Color.argb(90,255,255,255));capsule.setBackground(bg);
    CapsuleButton more=new CapsuleButton(false);more.setContentDescription("更多游戏操作");more.setOnClickListener(v->showGameMenu());capsule.addView(more,new LinearLayout.LayoutParams(dp(53),dp(44)));
    View divider=new View(this);divider.setBackgroundColor(Color.argb(80,255,255,255));capsule.addView(divider,new LinearLayout.LayoutParams(dp(1),dp(20)));
    CapsuleButton close=new CapsuleButton(true);close.setContentDescription("关闭游戏，返回首页");close.setOnClickListener(v->closeGame());capsule.addView(close,new LinearLayout.LayoutParams(dp(53),dp(44)));
    FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(dp(112),dp(44),Gravity.TOP|Gravity.RIGHT);root.addView(capsule,lp);updateSafeArea();immersive(getWindow());
    game.loadUrl(GAME+playing.getString("id")+"/"+playing.getString("build_sha256")+"/"+playing.getString("entrypoint"));
  }catch(Exception e){closeGame();notifyStatus("游戏暂时无法打开，请重新下载");}}
  private final class CapsuleButton extends View {
    private final boolean close;private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    CapsuleButton(boolean close){super(MainActivity.this);this.close=close;setClickable(true);setFocusable(true);setMinimumHeight(dp(44));}
    @Override protected void onDraw(Canvas c){super.onDraw(c);float x=getWidth()/2f,y=getHeight()/2f;paint.setColor(Color.WHITE);paint.setAlpha(isPressed()?140:255);
      if(close){paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(2));c.drawCircle(x,y,dp(8),paint);paint.setStyle(Paint.Style.FILL);c.drawCircle(x,y,dp(3),paint);}
      else{paint.setStyle(Paint.Style.FILL);for(int i=-1;i<=1;i++)c.drawCircle(x+i*dp(7),y,dp(2),paint);}
    }
    @Override public void setPressed(boolean pressed){super.setPressed(pressed);invalidate();}
  }
  private boolean favorite(String id){return getSharedPreferences("player",MODE_PRIVATE).getBoolean("favorite:"+id,false);}
  private boolean toggleFavorite(String id){boolean next=!favorite(id);getSharedPreferences("player",MODE_PRIVATE).edit().putBoolean("favorite:"+id,next).apply();return next;}
  private void refreshLibrary(){if(library!=null)library.evaluateJavascript("window.refresh&&window.refresh()",null);}
  private Button menuButton(LinearLayout container,String text,Runnable action){Button b=new Button(this);b.setText(text);b.setTextSize(16);b.setAllCaps(false);b.setGravity(Gravity.LEFT|Gravity.CENTER_VERTICAL);b.setPadding(dp(20),0,dp(20),0);styleButton(b);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(52));lp.topMargin=dp(10);container.addView(b,lp);b.setOnClickListener(v->action.run());return b;}
  private void dismissMenu(){if(gameMenu!=null){gameMenu.dismiss();gameMenu=null;}}
  private void showGameMenu(){
    if(playing==null||gameMenu!=null)return;
    gameMenu=new Dialog(this);LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(22),dp(24),dp(22),dp(26)+safeBottom);
    GradientDrawable bg=new GradientDrawable();bg.setColor(Color.rgb(250,245,232));bg.setCornerRadii(new float[]{dp(24),dp(24),dp(24),dp(24),0,0,0,0});bg.setStroke(dp(2),Color.rgb(28,29,26));content.setBackground(bg);
    TextView name=new TextView(this);name.setText(playing.optString("title"));name.setTextSize(21);name.setTypeface(null,1);name.setTextColor(Color.rgb(28,29,26));content.addView(name);
    TextView note=new TextView(this);note.setText("你的游戏，随时开玩。");note.setTextColor(Color.rgb(110,104,91));note.setPadding(0,dp(6),0,dp(5));content.addView(note);
    menuButton(content,"继续游戏",()->dismissMenu());
    menuButton(content,favorite(playing.optString("id"))?"★  已收藏 · 取消收藏":"☆  收藏游戏",()->{boolean added=toggleFavorite(playing.optString("id"));dismissMenu();refreshLibrary();Toast.makeText(this,added?"已加入我的收藏":"已取消收藏",Toast.LENGTH_SHORT).show();});
    menuButton(content,"添加到桌面",()->{dismissMenu();pinGame();});
    menuButton(content,"重新打开",()->{dismissMenu();AlertDialog d=new AlertDialog.Builder(this).setTitle("重新打开游戏？").setMessage("当前这一局可能会重置。已下载的游戏会保留。").setNegativeButton("继续玩",null).setPositiveButton("重新打开",(a,b)->{reopenInstalled();}).create();showImmersiveDialog(d);});
    menuButton(content,"写下评价",()->{dismissMenu();review();});
    menuButton(content,"游戏信息",()->{dismissMenu();showGameInfo();});
    menuButton(content,"返回 owngame 首页",()->closeGame());
    ScrollView scroll=new ScrollView(this);scroll.setFillViewport(false);scroll.addView(content);gameMenu.setContentView(scroll);Window w=gameMenu.getWindow();if(w!=null){w.setBackgroundDrawableResource(android.R.color.transparent);w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);WindowManager.LayoutParams lp=w.getAttributes();lp.dimAmount=.45f;lp.gravity=Gravity.BOTTOM;w.setAttributes(lp);}
    gameMenu.setOnDismissListener(d->{gameMenu=null;immersive(getWindow());});gameMenu.show();if(w!=null){w.setLayout(-1,-2);immersive(w);}
  }
  private void showGameInfo(){if(playing==null)return;long bytes=0;JSONArray files=playing.optJSONArray("files");if(files!=null)for(int i=0;i<files.length();i++)bytes+=files.optJSONObject(i).optLong("bytes");
    String size=String.format(java.util.Locale.CHINA,"%.1f MB",bytes/1048576.0);
    AlertDialog d=new AlertDialog.Builder(this).setTitle(playing.optString("title")).setMessage(playing.optString("description")+"\n\n已下载 · 可离线玩\n本地大小："+size).setPositiveButton("知道了",null).create();showImmersiveDialog(d);
  }
  private void decorateDialog(AlertDialog d){
    if(d.getWindow()!=null){GradientDrawable bg=new GradientDrawable();bg.setColor(Color.rgb(250,245,232));bg.setCornerRadius(dp(18));bg.setStroke(dp(2),Color.rgb(32,34,30));d.getWindow().setBackgroundDrawable(bg);immersive(d.getWindow());}
    for(int which:new int[]{DialogInterface.BUTTON_POSITIVE,DialogInterface.BUTTON_NEGATIVE}){Button b=d.getButton(which);if(b!=null){b.setTextColor(Color.rgb(220,50,32));b.setTypeface(null,1);}}
  }
  private void showImmersiveDialog(AlertDialog d){d.setOnDismissListener(x->immersive(getWindow()));d.show();decorateDialog(d);}
  private void closeGame(){if(standalone()){dismissMenu();returnHome();return;}dismissMenu();if(game!=null){game.stopLoading();root.removeView(game);game.destroy();game=null;}if(capsule!=null){root.removeView(capsule);capsule=null;}playing=null;if(library!=null){library.setVisibility(View.VISIBLE);library.evaluateJavascript("window.goHome&&window.goHome()",null);}immersive(getWindow());}
  @Override public void onBackPressed(){if(gameMenu!=null)dismissMenu();else if(game!=null)closeGame();else if(library!=null)library.evaluateJavascript("window.backToHome&&window.backToHome()",result->{if(!"true".equals(result))MainActivity.super.onBackPressed();});else super.onBackPressed();}
  @Override public void onWindowFocusChanged(boolean hasFocus){super.onWindowFocusChanged(hasFocus);if(hasFocus)immersive(getWindow());}
  @Override public void onPause(){updateResumed=false;super.onPause();if(game!=null)game.onPause();}
  @Override public void onResume(){super.onResume();updateResumed=true;immersive(getWindow());if(game!=null)game.onResume();if(library!=null){refreshLibrary();long session=((OwngameApplication)getApplication()).foregroundSession();if(session!=checkedUpdateSession){checkedUpdateSession=session;checkAppUpdate(false);}}showPendingUpdate();}
  @Override public void onDestroy(){dismissMenu();if(documentDialog!=null)documentDialog.dismiss();if(updateDialog!=null)updateDialog.dismiss();updateIo.shutdownNow();io.shutdownNow();if(game!=null)game.destroy();if(library!=null)library.destroy();super.onDestroy();}
  private void styleButton(Button button){GradientDrawable bg=new GradientDrawable();bg.setColor(Color.rgb(255,252,243));bg.setCornerRadius(dp(12));bg.setStroke(dp(2),Color.rgb(32,34,30));button.setBackground(bg);button.setTextColor(Color.rgb(32,34,30));button.setStateListAnimator(null);}
  private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
  private void review(){
    if(playing==null)return;final JSONObject delivery=playing;LinearLayout form=new LinearLayout(this);form.setPadding(dp(24),dp(8),dp(24),0);form.setOrientation(LinearLayout.VERTICAL);
    TextView title=new TextView(this);title.setText("分享你的游戏感受。\n分别评价美术和操作手感，1 至 5 星。");form.addView(title);
    TextView artLabel=new TextView(this);artLabel.setText("美术表现");form.addView(artLabel);RatingBar art=new RatingBar(this);art.setNumStars(5);art.setStepSize(1);form.addView(art,new LinearLayout.LayoutParams(-2,-2));
    TextView feelLabel=new TextView(this);feelLabel.setText("操作手感");form.addView(feelLabel);RatingBar feel=new RatingBar(this);feel.setNumStars(5);feel.setStepSize(1);form.addView(feel,new LinearLayout.LayoutParams(-2,-2));
    EditText note=new EditText(this);note.setHint("哪里好看，哪里点起来不舒服？");note.setMinLines(2);form.addView(note);
    AlertDialog dialog=new AlertDialog.Builder(this).setTitle("试玩评价").setView(form).setNegativeButton("再玩一会",null).setPositiveButton("保存评价",null).create();dialog.setOnShowListener(x->dialog.getButton(-1).setOnClickListener(v->{
      if(art.getRating()<1||feel.getRating()<1||note.getText().toString().trim().isEmpty()){Toast.makeText(this,"请给出两项评分，并留下一句感受",Toast.LENGTH_SHORT).show();return;}
      try {JSONObject record=new JSONObject();record.put("delivery_id",delivery.getString("id"));record.put("build_sha256",delivery.getString("build_sha256"));record.put("reviewer","human");record.put("art",(int)art.getRating());record.put("feel",(int)feel.getRating());record.put("note",note.getText().toString().trim());record.put("issues",new JSONArray());record.put("idempotency_key",UUID.randomUUID().toString());
        File saved=new File(getFilesDir(),"reviews/"+record.getString("idempotency_key")+".json");save(saved,record.toString().getBytes("UTF-8"));dialog.dismiss();Toast.makeText(this,"评价已保存在手机上",Toast.LENGTH_SHORT).show();

      }catch(Exception e){Toast.makeText(this,"保存失败，请重试",Toast.LENGTH_SHORT).show();}
    }));dialog.setOnDismissListener(x->immersive(getWindow()));dialog.show();decorateDialog(dialog);
  }
  public final class LibraryBridge {
    @JavascriptInterface public String list(){try{JSONArray all=repository.list();for(int i=0;i<all.length();i++){JSONObject d=all.getJSONObject(i);String id=d.getString("id");d.put("downloading",id.equals(downloadingId));d.put("progress",id.equals(downloadingId)?downloadPercent:0);d.put("busy",syncing);d.put("favorite",MainActivity.this.favorite(id));d.put("last_played",getSharedPreferences("player",MODE_PRIVATE).getLong("played:"+id,0));}return all.toString();}catch(Exception e){return "[]";}}
    @JavascriptInterface public void favorite(String id){if(!id.matches("[a-z0-9][a-z0-9-]{0,63}"))return;runOnUiThread(()->{toggleFavorite(id);refreshLibrary();});}
    @JavascriptInterface public void download(String id){runOnUiThread(()->downloadGame(id));}
    @JavascriptInterface public void rollback(String id){runOnUiThread(()->rollbackGame(id));}
    @JavascriptInterface public void sync(){runOnUiThread(()->MainActivity.this.sync());}
    @JavascriptInterface public void checkAppUpdate(){runOnUiThread(()->MainActivity.this.checkAppUpdate(true));}
    @JavascriptInterface public void play(String id){runOnUiThread(()->launchGame(id));}
    @JavascriptInterface public String reviews(){JSONArray all=new JSONArray();File[] files=new File(getFilesDir(),"reviews").listFiles();if(files!=null)for(File f:files)try{if(f.getName().endsWith(".json"))all.put(new JSONObject(new String(readAll(new FileInputStream(f),32768),"UTF-8")));}catch(Exception ignored){}return all.toString();}
  }
  public final class Haptics {
    private long last=0;
    @JavascriptInterface public void tap(){runOnUiThread(()->{long now=SystemClock.uptimeMillis();if(game!=null&&now-last>=60){last=now;game.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);}});}
  }
}
