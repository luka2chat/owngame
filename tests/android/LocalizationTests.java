package dev.owngame.tests;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import dev.owngame.app.*;
import java.lang.reflect.*;
import java.util.concurrent.*;
import org.json.*;

/** Exercises the real shell and native game menu under the OS app locale. */
public final class LocalizationTests extends Instrumentation {
  MainActivity activity; WebView library; String expected; JSONArray results=new JSONArray();
  @Override public void onCreate(Bundle args){super.onCreate(args);expected=args.getString("language");start();}
  void yes(boolean condition,String message)throws Exception{if(!condition)throw new Exception(message);}
  String js(String expression)throws Exception{
    CountDownLatch done=new CountDownLatch(1);String[] result={null};
    runOnMainSync(()->library.evaluateJavascript(expression,v->{result[0]=v;done.countDown();}));
    yes(done.await(8,TimeUnit.SECONDS),"JavaScript timeout");return result[0];
  }
  String quote(String s){return JSONObject.quote(s);}
  void until(String expression)throws Exception{long end=SystemClock.uptimeMillis()+45000;while(SystemClock.uptimeMillis()<end){if("true".equals(js(expression)))return;SystemClock.sleep(200);}throw new Exception("Timed out: "+expression);}
  static void texts(View view,StringBuilder out){if(view instanceof TextView)out.append(((TextView)view).getText()).append('\n');if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)texts(group.getChildAt(i),out);}}
  static View described(View view,String label){if(label.equals(String.valueOf(view.getContentDescription())))return view;if(view instanceof ViewGroup){ViewGroup g=(ViewGroup)view;for(int i=0;i<g.getChildCount();i++){View found=described(g.getChildAt(i),label);if(found!=null)return found;}}return null;}
  @Override public void onStart(){
    android.content.SharedPreferences prefs=getTargetContext().getSharedPreferences("player",0);
    boolean hadPlayed=prefs.contains("played:signal-harbor");long played=prefs.getLong("played:signal-harbor",0);
    try{
      activity=(MainActivity)startActivitySync(new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      Field field=MainActivity.class.getDeclaredField("library");field.setAccessible(true);library=(WebView)field.get(activity);
      until("!!window.AppText && document.documentElement.lang==="+quote(expected));
      boolean en="en".equals(expected);yes(AppText.language().equals(expected),"Native and shell language differ");
      yes(js("document.querySelector('.bottom-nav [data-page=mine] span').textContent").equals(quote(en?"My games":"我的游戏")),"Navigation translation");
      js("document.querySelector('[data-page=categories]').click()");
      yes(js("document.querySelector('.section-head h2').textContent").equals(quote(en?"What will you play today?":"今天想玩什么？")),"Category heading");
      js("document.querySelector('[data-page=mine]').click();document.querySelectorAll('.mine-tabs button')[1].click()");
      String favorites=js("JSON.stringify(games.filter(g=>g.favorite).map(g=>g.id).sort())");
      js("window.applyAppLanguage()");yes(favorites.equals(js("JSON.stringify(games.filter(g=>g.favorite).map(g=>g.id).sort())")),"Favorites changed after render");
      js("window.goHome()");until("games.some(g=>g.id==='signal-harbor'&&g.downloaded)");
      Method open=MainActivity.class.getDeclaredMethod("open",String.class);open.setAccessible(true);
      runOnMainSync(()->{try{open.invoke(activity,"signal-harbor");}catch(Exception e){throw new RuntimeException(e);}});
      waitForIdleSync();
      runOnMainSync(()->{View more=described(activity.getWindow().getDecorView(),en?"More game options":"更多游戏操作");if(more==null)throw new AssertionError("More button not localized");more.performClick();});
      Field menu=MainActivity.class.getDeclaredField("gameMenu");menu.setAccessible(true);Dialog dialog=(Dialog)menu.get(activity);yes(dialog!=null&&dialog.isShowing(),"Native menu not shown");
      StringBuilder content=new StringBuilder();runOnMainSync(()->texts(dialog.getWindow().getDecorView(),content));
      yes(content.toString().contains(en?"Continue game":"继续游戏"),"Continue button");
      yes(content.toString().contains(en?"Game information":"游戏信息"),"Information button");
      yes(content.toString().contains(en?"Signal Harbor":"潮光归位"),"Localized game title");
      if(en)yes(!content.toString().matches("(?s).*[\\p{IsHan}].*"),"Untranslated menu: "+content);
      results.put(new JSONObject().put("language",expected).put("passed",true).put("menu",content.toString()));
    }catch(Throwable error){try{results.put(new JSONObject().put("language",expected).put("passed",false).put("error",error.toString()));}catch(Exception ignored){}}
    finally{if(activity!=null)runOnMainSync(()->activity.finish());if(hadPlayed)prefs.edit().putLong("played:signal-harbor",played).commit();else prefs.edit().remove("played:signal-harbor").commit();}
    Bundle report=new Bundle();report.putString("results",results.toString());finish(results.optJSONObject(0).optBoolean("passed")?-1:0,report);
  }
}
