import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {toolchain} from "./toolchain.mjs";

const root=path.resolve(import.meta.dirname,"../.."),{java}=toolchain();
if(process.argv.slice(2).some(arg=>arg!=="--live"))throw Error("Usage: node scripts/android/test-updates.mjs [--live]");
const local=path.join(root,".local");await fs.mkdir(local,{recursive:true});
const jar=path.join(local,"json-20240303.jar");
const expected="3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed";
let bytes;try{bytes=await fs.readFile(jar);}catch(error){if(error.code!=="ENOENT")throw error;}
if(!bytes){
  const response=await fetch("https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar",{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error("Could not fetch the pinned host-test JSON library");
  bytes=Buffer.from(await response.arrayBuffer());
}
if(createHash("sha256").update(bytes).digest("hex")!==expected)throw Error("Host-test JSON dependency checksum mismatch");
await fs.writeFile(jar,bytes);
const out=await fs.mkdtemp(path.join(local,"app-update-tests-"));
try{
  execFileSync(path.join(java,"bin/javac"),["--release","8","-encoding","UTF-8","-classpath",jar,"-d",out,
    path.join(root,"apps/android/src/dev/owngame/app/AppUpdateChecker.java"),path.join(root,"tests/android/AppUpdateCheckerTests.java")],{stdio:"inherit"});
  execFileSync(path.join(java,"bin/java"),["-ea","-classpath",out+path.delimiter+jar,"dev.owngame.tests.AppUpdateCheckerTests",...process.argv.slice(2)],{stdio:"inherit",timeout:90000});
}finally{await fs.rm(out,{recursive:true,force:true});}
