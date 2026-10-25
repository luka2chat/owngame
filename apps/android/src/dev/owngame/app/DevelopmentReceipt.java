package dev.owngame.app;

import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** USB development receipts; never exposed as a JavaScript/native bridge. */
final class DevelopmentReceipt {
  static final String INBOX="DevelopmentInbox";
  private final File folder;
  private final JSONObject value=new JSONObject();
  private final JSONArray logs=new JSONArray();
  static boolean validRequest(String id){return id!=null&&id.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}");}
  DevelopmentReceipt(File folder)throws Exception{
    if(!validRequest(folder.getName()))throw new IOException("Invalid development request");
    this.folder=folder;value.put("schema","owngame.device-receipt.v1").put("requestId",folder.getName());
  }
  synchronized void installed(JSONObject game){try{value.put("gameId",game.getString("id")).put("version",game.getString("build_sha256"));state("installed","");}catch(Exception ignored){}}
  synchronized void running(JSONObject game){try{installed(game);state("running","");cleanupTransfer();}catch(Exception ignored){}}
  synchronized void fail(String message){state("failed",message);cleanupTransfer();}
  synchronized void log(String level,String message){try{
    if(message.length()>2000)message=message.substring(0,2000);
    logs.put(new JSONObject().put("level",level).put("message",message).put("time",System.currentTimeMillis()));
    while(logs.length()>100)logs.remove(0);value.put("logs",logs);write();
  }catch(Exception ignored){}}
  private void cleanupTransfer(){new Thread(()->{for(String name:new String[]{"files","package.json","ready.json"})GameRepository.removeDevelopmentCache(new File(folder,name));},"OwngameDevCleanup").start();}
  private void state(String status,String message){try{value.put("status",status).put("message",message.length()>2000?message.substring(0,2000):message);write();}catch(Exception ignored){}}
  private void write()throws Exception{
    folder.mkdirs();value.put("updatedAt",System.currentTimeMillis());
    AtomicFile atomic=new AtomicFile(new File(folder,"receipt.json"));FileOutputStream out=null;
    try{out=atomic.startWrite();out.write(value.toString().getBytes(StandardCharsets.UTF_8));atomic.finishWrite(out);}catch(Exception e){if(out!=null)atomic.failWrite(out);throw e;}
  }
}
