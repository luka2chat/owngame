package dev.owngame.tests;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import dev.owngame.app.MainActivity;
import org.json.*;
import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Runs the real application's WebView configuration with an isolated local game. */
public final class WebViewTests extends Instrumentation {
  interface Check {void run() throws Exception;}
  JSONArray results=new JSONArray();
  MainActivity activity;WebView view;File fixture,gameRoot;String url,gameFixture;
  void test(String name,Check check){try{check.run();results.put(new JSONObject().put("name",name).put("passed",true));}catch(Throwable e){try{results.put(new JSONObject().put("name",name).put("passed",false).put("error",e.toString()));}catch(Exception ignored){}}}
  static void yes(boolean condition)throws Exception{if(!condition)throw new Exception("Assertion failed");}
  @Override public void onCreate(Bundle args){super.onCreate(args);gameFixture=args.getString("gameFixture");start();}
  @Override public void onStart(){
    try{runTests();}catch(Throwable e){test("harness",()->{throw new Exception(e);});}
    finally{runOnMainSync(()->{if(view!=null){((android.view.ViewGroup)view.getParent()).removeView(view);view.destroy();}if(activity!=null)activity.finish();});if(gameRoot!=null)remove(gameRoot);}
    Bundle result=new Bundle();result.putString("results",results.toString());boolean pass=true;for(int i=0;i<results.length();i++)if(!results.optJSONObject(i).optBoolean("passed"))pass=false;finish(pass?-1:0,result);
  }
  void write(String name,String text)throws Exception{File file=new File(fixture,name);file.getParentFile().mkdirs();try(FileOutputStream out=new FileOutputStream(file)){out.write(text.getBytes(StandardCharsets.UTF_8));}}
  String js(String code)throws Exception{CountDownLatch done=new CountDownLatch(1);String[] value={null};runOnMainSync(()->view.evaluateJavascript(code,v->{value[0]=v;done.countDown();}));yes(done.await(5,TimeUnit.SECONDS));return value[0];}
  void until(Check check)throws Exception{until(15000,check);}
  void until(long timeout,Check check)throws Exception{long end=SystemClock.uptimeMillis()+timeout;Throwable last=null;while(SystemClock.uptimeMillis()<end){try{check.run();return;}catch(Throwable e){last=e;SystemClock.sleep(100);}}throw new Exception("Timed out",last);}
  void tap(String id)throws Exception{
    JSONObject p=new JSONObject(new JSONArray("["+js("(()=>{const r=document.getElementById('"+id+"').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")+"]").getJSONObject(0).toString());
    int[] origin=new int[2];float[] scale={1};runOnMainSync(()->{view.getLocationOnScreen(origin);scale[0]=view.getScale();});
    float x=origin[0]+(float)p.getDouble("x")*scale[0],y=origin[1]+(float)p.getDouble("y")*scale[0];long now=SystemClock.uptimeMillis();
    MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,x,y,0),up=MotionEvent.obtain(now,now+80,MotionEvent.ACTION_UP,x,y,0);
    try{sendPointerSync(down);sendPointerSync(up);}finally{down.recycle();up.recycle();}waitForIdleSync();
  }
  AlertDialog document()throws Exception{Field f=MainActivity.class.getDeclaredField("documentDialog");f.setAccessible(true);return (AlertDialog)f.get(activity);}
  void runTests()throws Exception{
    String id="webview-test-"+UUID.randomUUID(),version=String.join("",Collections.nCopies(64,"a"));
    gameRoot=new File(getTargetContext().getFilesDir(),"games/"+id);fixture=new File(gameRoot,version+"/files");
    url="https://game.owngame.invalid/"+id+"/"+version+"/index.html";
    write("index.html","<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><style>button,a{display:block;margin:22px;padding:18px}</style><button id='start' disabled>Start</button><a id='source' target='_blank' href='https://github.com/luka2chat/owngame'>Source</a><a id='license' target='_blank' href='licenses/NOTICE.md.txt'>License</a><script type='module' src='launch.js'></script>");
    write("launch.js","import {ready} from './part.mjs';document.getElementById('start').disabled=!ready;document.getElementById('start').onclick=()=>document.body.dataset.started='yes';");
    write("part.mjs","export const ready=true;");write("licenses/NOTICE.md.txt","Isolated offline license fixture\nMIT and third-party notices.");
    activity=(MainActivity)startActivitySync(new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    runOnMainSync(()->{try{view=new WebView(activity);Method configure=MainActivity.class.getDeclaredMethod("configure",WebView.class,boolean.class);configure.setAccessible(true);configure.invoke(activity,view,false);activity.addContentView(view,new android.view.ViewGroup.LayoutParams(-1,-1));view.loadUrl(url);}catch(Exception e){throw new RuntimeException(e);}});
    test("ES module import enables the start button",()->until(()->yes("true".equals(js("!!document.getElementById('start')&&!document.getElementById('start').disabled")))));
    test("touch starts the loaded module",()->{tap("start");until(()->yes("\"yes\"".equals(js("document.body.dataset.started"))));});
    test("target blank source opens HTTPS browser without replacing the game",()->{
      IntentFilter filter=new IntentFilter(Intent.ACTION_VIEW);filter.addCategory(Intent.CATEGORY_BROWSABLE);filter.addDataScheme("https");filter.addDataAuthority("github.com",null);
      ActivityMonitor monitor=addMonitor(filter,null,true);
      try{tap("source");until(()->yes(monitor.getHits()==1));yes(('"'+url+'"').equals(js("location.href")));}finally{removeMonitor(monitor);}
    });
    test("target blank license opens local text and preserves the game",()->{
      tap("license");until(()->{AlertDialog d=document();yes(d!=null&&d.isShowing());});yes(('"'+url+'"').equals(js("location.href")));
      runOnMainSync(()->{try{document().dismiss();}catch(Exception e){throw new RuntimeException(e);}});
    });
    test("license response is plain text and local fetch works offline",()->{
      js("window.licenseResult=null;fetch('licenses/NOTICE.md.txt').then(async r=>window.licenseResult={type:r.headers.get('Content-Type'),text:await r.text()})");
      until(()->yes(!"null".equals(js("window.licenseResult"))));JSONObject value=new JSONObject(js("window.licenseResult"));yes(value.getString("type").startsWith("text/plain"));yes(value.getString("text").contains("Isolated offline license fixture"));
    });
    test("cross origin subresources remain blocked",()->{
      js("window.externalResult=null;fetch('https://github.com/luka2chat/owngame').then(r=>window.externalResult=r.status).catch(()=>window.externalResult='blocked')");
      until(()->yes("\"blocked\"".equals(js("window.externalResult"))||"403".equals(js("window.externalResult"))));
    });
    test("script and unsafe navigation cannot open browser",()->{
      ActivityMonitor monitor=addMonitor(new IntentFilter(Intent.ACTION_VIEW),null,true);
      try{js("location.href='https://github.com/luka2chat/owngame'");js("location.href='intent://example#Intent;scheme=https;end'");SystemClock.sleep(500);yes(monitor.getHits()==0);yes(('"'+url+'"').equals(js("location.href")));}finally{removeMonitor(monitor);}
    });
    if(gameFixture!=null){
      runOnMainSync(()->view.loadUrl("about:blank"));remove(fixture);copy(new File(gameFixture),fixture);
      runOnMainSync(()->view.loadUrl(url));
      test("published Star Letters module enables its real start button",()->until(()->yes("true".equals(js("!!document.getElementById('start')&&!document.getElementById('start').disabled")))));
      test("published Star Letters starts Unity from local files",()->{
        tap("start");long end=SystemClock.uptimeMillis()+120000;
        while(SystemClock.uptimeMillis()<end){
          String error=js("window.starLetters&&window.starLetters.error||''");if(!"\"\"".equals(error))throw new Exception(error);
          if("true".equals(js("!!window.starLetters?.ready")))return;SystemClock.sleep(300);
        }
        throw new Exception("Unity startup timeout: "+js("document.getElementById('status')?.textContent"));
      });
    }
    runOnMainSync(()->view.loadUrl("about:blank"));
  }
  static void copy(File source,File target)throws Exception{if(source.isDirectory()){target.mkdirs();for(File child:source.listFiles())copy(child,new File(target,child.getName()));}else{try(InputStream in=new FileInputStream(source);OutputStream out=new FileOutputStream(target)){byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);}}}
  static void remove(File file){File[] children=file.listFiles();if(children!=null)for(File child:children)remove(child);file.delete();}
}
