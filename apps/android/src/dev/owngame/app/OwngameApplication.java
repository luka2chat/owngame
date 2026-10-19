package dev.owngame.app;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;

/** Distinguish opening the app from switching between its library and game tasks. */
public final class OwngameApplication extends Application {
  private int started=0;
  private long session=0;
  public long foregroundSession(){return session;}
  @Override public void onCreate(){
    super.onCreate();
    registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks(){
      public void onActivityStarted(Activity activity){if(started++==0)session++;}
      public void onActivityStopped(Activity activity){started=Math.max(0,started-1);}
      public void onActivityCreated(Activity activity,Bundle state){}
      public void onActivityResumed(Activity activity){}
      public void onActivityPaused(Activity activity){}
      public void onActivitySaveInstanceState(Activity activity,Bundle state){}
      public void onActivityDestroyed(Activity activity){}
    });
  }
}
