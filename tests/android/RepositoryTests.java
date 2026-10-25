package dev.owngame.tests;
import android.app.Instrumentation;
import android.os.Bundle;
import dev.owngame.app.GameRepository;
import org.json.*;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;

public final class RepositoryTests extends Instrumentation {
  interface Check { void run() throws Exception; }
  JSONArray results=new JSONArray();
  void test(String name,Check check){try{check.run();results.put(new JSONObject().put("name",name).put("passed",true));}catch(Throwable e){try{results.put(new JSONObject().put("name",name).put("passed",false).put("error",e.toString()));}catch(Exception ignored){}}}
  static void yes(boolean condition)throws Exception{if(!condition)throw new Exception("Assertion failed");}
  static void rejects(Check check)throws Exception{boolean failed=false;try{check.run();}catch(Exception expected){failed=true;}yes(failed);}
  static byte[] data(String s){return s.getBytes(StandardCharsets.UTF_8);}
  static final class Fixture {
    final byte[] html;final String version,prefix;final JSONObject item;final JSONArray manifest;
    Fixture(String text)throws Exception{
      html=data(text);String hash=GameRepository.sha(html);String canonical="[{\"bytes\":"+html.length+",\"path\":\"index.html\",\"sha256\":\""+hash+"\"}]";
      version=GameRepository.sha(data(canonical));prefix="/games/test-game/"+version+"/";
      item=new JSONObject().put("id","test-game").put("version",version).put("title","Test").put("description","Isolated fixture").put("entry",prefix+"index.html").put("manifest",prefix+"manifest.json").put("bytes",html.length);
      manifest=new JSONArray().put(new JSONObject().put("url",prefix+"index.html").put("bytes",html.length).put("sha256",hash));
    }
  }
  static final class Fake implements GameRepository.Transport {
    Fixture current;boolean corrupt=false,offline=false,failFile=false;int files=0;JSONArray catalogOverride;
    Fake(Fixture f){current=f;}
    public byte[] get(String path,int max)throws Exception{
      if(offline)throw new IOException("Simulated network loss");
      if(path.equals("/catalog.json"))return data((catalogOverride!=null?catalogOverride:new JSONArray().put(current.item)).toString());
      if(path.endsWith("/manifest.json"))return data(current.manifest.toString());
      files++;if(failFile)throw new IOException("Interrupted download");return corrupt?data("corrupt"):current.html;
    }
  }
  private boolean probe;
  @Override public void onCreate(Bundle args){super.onCreate(args);probe="true".equals(args.getString("probe"));start();}
  @Override public void onStart(){new Thread(()->{try{runTests();}catch(Throwable e){test("harness",()->{throw new Exception(e);});}Bundle result=new Bundle();result.putString("results",results.toString());boolean pass=true;for(int i=0;i<results.length();i++)if(!results.optJSONObject(i).optBoolean("passed"))pass=false;finish(pass?-1:0,result);}).start();}
  void runTests()throws Exception{
    if(probe){
      String path="/games/unlock-bolts-mobile/82d3dac339318b4d391d95458dee55e1c57bf49462d53a7fd87a3177b994c8b6/index.html";
      URL url=new URL("https://owngame.dev"+path);
      for(int i=0;i<3;i++){
        java.net.HttpURLConnection c=(java.net.HttpURLConnection)url.openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(20000);c.setRequestProperty("Accept-Encoding","identity");c.setRequestProperty("Cache-Control","no-cache");
        try{int code=c.getResponseCode();JSONObject row=new JSONObject().put("url",url.toString()).put("status",code).put("headers",String.valueOf(c.getHeaderFields()));
          if(code>=300&&code<400){URL next=new URL(url,c.getHeaderField("Location"));GameRepository.validateRedirect(url,next);row.put("passed",true);results.put(row);url=next;continue;}
          byte[] data=GameRepository.read(c.getInputStream(),256*1024);String hash=GameRepository.sha(data);row.put("bytes",data.length).put("sha256",hash).put("passed",code==200&&data.length==1067&&hash.equals("c2904ce1681d2ca05e052f0a4d638c791a2e027806b60480fcfdf537c56fde51")&&String.valueOf(c.getHeaderField("Cache-Control")).contains("no-transform"));results.put(row);return;
        }finally{c.disconnect();}
      }
      throw new IOException("Probe redirect limit exceeded");
    }

    File root=new File(getTargetContext().getCacheDir(),"repository-tests-"+UUID.randomUUID());root.mkdirs();
    Fixture v1=new Fixture("<html>Version one</html>"),v2=new Fixture("<html>Version two</html>");Fake net=new Fake(v1);GameRepository repo=new GameRepository(root,net);
    test("catalog refresh does not install or download game files",()->{repo.refresh();yes(repo.installed().length()==0);yes(net.files==0);yes(!repo.list().getJSONObject(0).getBoolean("downloaded"));});
    test("first install commits only verified assets",()->{repo.download("test-game",p->{});yes(repo.installed("test-game").getString("build_sha256").equals(v1.version));yes(net.files==1);});
    test("same version reuses verified files",()->{repo.download("test-game",p->{});yes(net.files==1);});
    test("update discovery keeps old version playable",()->{net.current=v2;repo.refresh();yes(repo.list().getJSONObject(0).getBoolean("update_available"));yes(repo.installed("test-game").getString("build_sha256").equals(v1.version));});
    test("network failure preserves installed pointer",()->{net.failFile=true;rejects(()->repo.download("test-game",p->{}));net.failFile=false;yes(repo.installed("test-game").getString("build_sha256").equals(v1.version));});
    test("hash mismatch rejects corrupt update",()->{net.corrupt=true;rejects(()->repo.download("test-game",p->{}));net.corrupt=false;yes(repo.installed("test-game").getString("build_sha256").equals(v1.version));});
    test("retry switches atomically and retains previous version",()->{repo.download("test-game",p->{});JSONObject d=repo.installed("test-game");yes(d.getString("build_sha256").equals(v2.version));yes(d.getString("previous_version").equals(v1.version));});
    test("offline catalogue and rollback need no server",()->{net.offline=true;yes(repo.list().length()==1);repo.rollback("test-game");yes(repo.installed("test-game").getString("build_sha256").equals(v1.version));net.offline=false;});
    test("manifest traversal and mismatch leave installed version intact",()->{net.current=new Fixture("traversal");net.current.manifest.getJSONObject(0).put("url",net.current.prefix+"../outside");repo.refresh();rejects(()->repo.download("test-game",p->{}));yes(repo.installed("test-game").getString("build_sha256").equals(v1.version));});
    test("duplicate public IDs do not replace last valid catalogue",()->{net.current=v2;repo.refresh();net.catalogOverride=new JSONArray().put(v1.item).put(v1.item);rejects(()->repo.refresh());yes(repo.list().getJSONObject(0).getString("version").equals(v2.version));net.catalogOverride=null;});
    test("offline refresh failure preserves current catalogue",()->{net.offline=true;rejects(()->repo.refresh());yes(repo.list().getJSONObject(0).getString("version").equals(v2.version));net.offline=false;});
    test("removed listings retain downloaded games",()->{net.catalogOverride=new JSONArray();repo.refresh();yes(repo.list().getJSONObject(0).getBoolean("downloaded"));yes(repo.list().getJSONObject(0).getBoolean("unlisted"));});
    test("Pages index redirect allowed; cross-origin and downgrade denied",()->{URL from=new URL("https://owngame.dev/games/test/v/index.html");GameRepository.validateRedirect(from,new URL("https://owngame.dev/games/test/v/"));rejects(()->GameRepository.validateRedirect(from,new URL("http://owngame.dev/games/test/v/")));rejects(()->GameRepository.validateRedirect(from,new URL("https://evil.example/games/test/v/")));rejects(()->GameRepository.validateRedirect(from,new URL("https://owngame.dev/")));});
    test("unsafe paths and oversized payloads rejected",()->{rejects(()->GameRepository.validateRoute("//evil.example/x"));rejects(()->GameRepository.validateRoute("/games/%2e%2e/x"));rejects(()->GameRepository.safe("../x"));rejects(()->GameRepository.read(new ByteArrayInputStream(new byte[3]),2));});
    test("transient transport errors retry twice; permanent errors stop",()->{
      int[] attempts={0};byte[] ok=GameRepository.retryNetwork((path,max)->{if(++attempts[0]<3)throw new java.net.SocketTimeoutException("temporary");return data("ok");},"/catalog.json",10);yes(attempts[0]==3&&new String(ok,StandardCharsets.UTF_8).equals("ok"));
      attempts[0]=0;rejects(()->GameRepository.retryNetwork((path,max)->{attempts[0]++;throw new java.net.SocketException("closed");},"/catalog.json",10));yes(attempts[0]==3);
      attempts[0]=0;rejects(()->GameRepository.retryNetwork((path,max)->{attempts[0]++;throw new IOException("HTTP 403");},"/catalog.json",10));yes(attempts[0]==1);
    });
    test("ranged downloads resume saved bytes and enforce response boundaries",()->{
      byte[] payload=new byte[150000];new Random(42).nextBytes(payload);int[] calls={0};boolean[] fail={true};int[] first={-1};
      GameRepository.RangedTransport ranged=new GameRepository.RangedTransport(){
        public byte[] get(String p,int m){return payload;}
        public byte[] range(String p,int start,int count,int total)throws Exception{if(first[0]<0)first[0]=start;if(fail[0]&&++calls[0]==2)throw new IOException("connection lost");return Arrays.copyOfRange(payload,start,start+count);}
      };
      File part=new File(root,"partial-test/file.part");rejects(()->GameRepository.rangedFile(ranged,"/file",payload.length,part,n->{}));yes(part.length()==65536);
      fail[0]=false;first[0]=-1;yes(Arrays.equals(payload,GameRepository.rangedFile(ranged,"/file",payload.length,part,n->{})));yes(first[0]==65536);
      GameRepository.validateRange("bytes 0-65535/150000",0,65536,150000);
      rejects(()->GameRepository.validateRange("bytes 1-65536/150000",0,65536,150000));rejects(()->GameRepository.validateRange("bytes 0-65535/150001",0,65536,150000));
    });
    test("corrupt ranged file cannot install and is discarded before retry",()->{
      char[] chars=new char[90000];Arrays.fill(chars,'x');Fixture large=new Fixture(new String(chars));Fake delegate=new Fake(large);boolean[] corrupt={true};
      GameRepository.RangedTransport ranged=new GameRepository.RangedTransport(){
        public byte[] get(String p,int max)throws Exception{return delegate.get(p,max);}
        public byte[] range(String p,int start,int count,int total){byte[] chunk=Arrays.copyOfRange(large.html,start,start+count);if(corrupt[0])chunk[0]^=1;return chunk;}
      };
      File isolated=new File(root,"range-integrity");isolated.mkdirs();GameRepository r=new GameRepository(isolated,ranged);r.refresh();rejects(()->r.download("test-game",n->{}));yes(r.installed().length()==0);
      yes(!new File(isolated,"games/test-game/"+large.version+"/partial/index.html.part").exists());
      corrupt[0]=false;r.download("test-game",n->{});yes(r.installed("test-game").getString("build_sha256").equals(large.version));
    });
    test("HTTP 200 range fallback requires complete bounded body",()->{
      byte[] full=data("abcdef");yes(Arrays.equals(data("cd"),GameRepository.sliceFullResponse(full,2,2,6)));
      rejects(()->GameRepository.sliceFullResponse(full,2,2,7));rejects(()->GameRepository.sliceFullResponse(full,5,2,6));rejects(()->GameRepository.sliceFullResponse(full,-1,2,6));
    });
    test("PC listings cannot leak through installed fallback, downloads or shortcuts",()->{
      Fixture f=new Fixture("platform test");Fake server=new Fake(f);File isolated=new File(root,"platforms");isolated.mkdirs();GameRepository r=new GameRepository(isolated,server);
      r.refresh();r.download("test-game",p->{});yes(r.mobileInstalled().length()==1);
      f.item.put("platforms",new JSONArray().put("pc"));r.refresh();
      yes(r.list().length()==0);yes(r.mobileInstalled().length()==0);yes(r.installed().length()==1);
      int before=server.files;rejects(()->r.download("test-game",p->{}));yes(server.files==before);
      for(Object value:new Object[]{new JSONArray(),new JSONArray().put("pc").put("pc"),new JSONArray().put("desktop"),"mobile",JSONObject.NULL}){
        f.item.put("platforms",value);rejects(()->r.refresh());yes(r.list().length()==0);
      }
      f.item.put("platforms",new JSONArray().put("mobile"));r.refresh();yes(r.list().length()==1);yes(r.mobileInstalled().length()==1);
      r.download("test-game",p->{});yes(r.installed("test-game").getJSONArray("platforms").getString(0).equals("mobile"));
      server.catalogOverride=new JSONArray();r.refresh();yes(r.list().length()==1);yes(r.mobileInstalled().length()==1);
    });
    test("development packages update offline, isolate official installs and retain rollback",()->{
      File incoming=new File(root,"development-incoming");incoming.mkdirs();
      String official=repo.installed("test-game").getString("build_sha256");
      File one=development(incoming,"local one"),two=development(incoming,"local two");
      JSONObject a=repo.importDevelopment(one),b=repo.importDevelopment(two);
      yes(a.getBoolean("development"));yes(b.getString("previous_version").equals(a.getString("build_sha256")));
      yes(repo.importDevelopment(two).getString("previous_version").equals(a.getString("build_sha256")));
      File bad=development(incoming,"local broken");try(FileOutputStream out=new FileOutputStream(new File(bad,"files/index.html"))){out.write(data("corrupt"));}
      rejects(()->repo.importDevelopment(bad));yes(repo.installed("dev-fixture").getString("build_sha256").equals(b.getString("build_sha256")));
      yes(repo.installed("test-game").getString("build_sha256").equals(official));
      repo.rollback("dev-fixture");yes(repo.installed("dev-fixture").getString("build_sha256").equals(a.getString("build_sha256")));
      File partial=development(incoming,"partial");new File(partial,"ready.json").delete();rejects(()->repo.importDevelopment(partial));
      yes(repo.installed("dev-fixture").getString("build_sha256").equals(a.getString("build_sha256")));
      JSONObject third=repo.importDevelopment(development(incoming,"local clean three"));
      yes(third.getString("previous_version").equals(a.getString("build_sha256")));
      yes(!new File(root,"games/dev-fixture/"+b.getString("build_sha256")).exists());
    });
    remove(root);
  }
  static File development(File root,String html)throws Exception{
    File folder=new File(root,UUID.randomUUID().toString());new File(folder,"files").mkdirs();byte[] body=data(html);
    String hash=GameRepository.sha(body);JSONArray files=new JSONArray().put(new JSONObject().put("path","index.html").put("bytes",body.length).put("sha256",hash));
    String version=GameRepository.sha(data("[{\"bytes\":"+body.length+",\"path\":\"index.html\",\"sha256\":\""+hash+"\"}]")),prefix="/games/dev-fixture/"+version+"/";
    JSONObject game=new JSONObject().put("id","dev-fixture").put("title","Fixture").put("description","USB fixture").put("version",version).put("entry",prefix+"index.html").put("manifest",prefix+"manifest.json").put("bytes",body.length).put("platforms",new JSONArray().put("mobile")).put("development",true);
    byte[] metadata=data(new JSONObject().put("schema","owngame.device-package.v1").put("requestId",folder.getName()).put("game",game).put("files",files).toString());
    try(FileOutputStream out=new FileOutputStream(new File(folder,"package.json"))){out.write(metadata);}
    try(FileOutputStream out=new FileOutputStream(new File(folder,"files/index.html"))){out.write(body);}
    byte[] ready=data(new JSONObject().put("schema","owngame.device-package.v1").put("requestId",folder.getName()).put("packageSha256",GameRepository.sha(metadata)).toString());
    try(FileOutputStream out=new FileOutputStream(new File(folder,"ready.json"))){out.write(ready);}return folder;
  }
  static void remove(File f){File[] children=f.listFiles();if(children!=null)for(File c:children)remove(c);f.delete();}
}
