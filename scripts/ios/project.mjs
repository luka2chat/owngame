import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const root = path.resolve(import.meta.dirname, '../..');
const id = key => createHash('sha256').update('owngame-ios:' + key).digest('hex').slice(0, 24).toUpperCase();
const q = JSON.stringify;
const array = values => '(' + values.join(', ') + ')';
export async function projectFiles() {
  const objects = new Map();
  const put = (key, type, values) => {
    objects.set(id(key), '{ isa = ' + type + '; ' + Object.entries(values).map(([k,v]) => k + ' = ' + v + ';').join(' ') + ' }');
    return id(key);
  };
  const sources = [];
  for (const folder of ['Core', 'App']) for (const name of (await fs.readdir(path.join(root, 'apps/ios/Sources', folder))).sort()) {
    if (name.endsWith('.swift')) sources.push('Sources/' + folder + '/' + name);
  }
  const sourceRefs = sources.map(file => put(file, 'PBXFileReference', {lastKnownFileType: q('sourcecode.swift'), path: q(file), sourceTree: q('<group>')}));
  const builds = sources.map(file => put(file + ':build', 'PBXBuildFile', {fileRef: id(file)}));
  const resourcePaths = [['Resources/Shell', 'folder'], ['Resources/Assets.xcassets', 'folder.assetcatalog'], ['PrivacyInfo.xcprivacy', 'text.xml']];
  const resources = resourcePaths.map(([file,type]) => put(file, 'PBXFileReference', {lastKnownFileType:q(type), path:q(file), sourceTree:q('<group>')}));
  const resourceBuilds = resourcePaths.map(([file]) => put(file + ':build', 'PBXBuildFile', {fileRef:id(file)}));
  const info = put('Info.plist', 'PBXFileReference', {lastKnownFileType:q('text.plist.xml'), path:q('Info.plist'), sourceTree:q('<group>')});
  const product = put('product', 'PBXFileReference', {explicitFileType:q('wrapper.application'), path:q('owngame.app'), sourceTree:q('BUILT_PRODUCTS_DIR')});
  const uiSource = put('ui-source', 'PBXFileReference', {lastKnownFileType:q('sourcecode.swift'), path:q('UITests/SmokeTests.swift'), sourceTree:q('<group>')});
  const uiBuild = put('ui-source:build', 'PBXBuildFile', {fileRef:uiSource});
  const uiProduct = put('ui-product', 'PBXFileReference', {explicitFileType:q('wrapper.cfbundle'), path:q('owngameUITests.xctest'), sourceTree:q('BUILT_PRODUCTS_DIR')});
  const products = put('products', 'PBXGroup', {children:array([product,uiProduct]), name:q('Products'), sourceTree:q('<group>')});
  const group = put('group', 'PBXGroup', {children:array([...sourceRefs,...resources,info,uiSource,products]), sourceTree:q('<group>')});
  const sourcePhase = put('sources', 'PBXSourcesBuildPhase', {buildActionMask:'2147483647', files:array(builds), runOnlyForDeploymentPostprocessing:0});
  const resourcePhase = put('resources', 'PBXResourcesBuildPhase', {buildActionMask:'2147483647', files:array(resourceBuilds), runOnlyForDeploymentPostprocessing:0});
  const frameworkPhase = put('frameworks', 'PBXFrameworksBuildPhase', {buildActionMask:'2147483647', files:'()', runOnlyForDeploymentPostprocessing:0});
  for (const name of ['Debug', 'Release']) {
    const settings = {
      CLANG_ENABLE_MODULES:'YES', SDKROOT:'iphoneos', IPHONEOS_DEPLOYMENT_TARGET:q('16.0'), SWIFT_VERSION:q('5.0'),
      TARGETED_DEVICE_FAMILY:q('1,2'), PRODUCT_BUNDLE_IDENTIFIER:q('dev.owngame.app'), PRODUCT_NAME:q('owngame'),
      INFOPLIST_FILE:q('Info.plist'), GENERATE_INFOPLIST_FILE:'NO', CODE_SIGN_STYLE:'Automatic',
      ASSETCATALOG_COMPILER_APPICON_NAME:q('AppIcon'), SUPPORTED_PLATFORMS:q('iphoneos iphonesimulator'),
      SUPPORTS_MACCATALYST:'NO', SWIFT_OPTIMIZATION_LEVEL:q(name === 'Debug' ? '-Onone' : '-O'),
      DEBUG_INFORMATION_FORMAT:q(name === 'Debug' ? 'dwarf' : 'dwarf-with-dsym'),
      SWIFT_ACTIVE_COMPILATION_CONDITIONS:q(name === 'Debug' ? 'DEBUG' : ''), ENABLE_TESTABILITY:name === 'Debug' ? 'YES' : 'NO'
    };
    put(name, 'XCBuildConfiguration', {buildSettings:'{ ' + Object.entries(settings).map(([k,v])=>k+' = '+v+';').join(' ') + ' }', name:q(name)});
    put('project:' + name, 'XCBuildConfiguration', {buildSettings:'{}', name:q(name)});
  }
  const configs = put('configs', 'XCConfigurationList', {buildConfigurations:array([id('Debug'),id('Release')]), defaultConfigurationIsVisible:0, defaultConfigurationName:'Release'});
  const projectConfigs = put('project-configs', 'XCConfigurationList', {buildConfigurations:array([id('project:Debug'),id('project:Release')]), defaultConfigurationIsVisible:0, defaultConfigurationName:'Release'});
  const target = put('app', 'PBXNativeTarget', {buildConfigurationList:configs, buildPhases:array([sourcePhase,frameworkPhase,resourcePhase]), buildRules:'()', dependencies:'()', name:q('owngame'), productName:q('owngame'), productReference:product, productType:q('com.apple.product-type.application')});
  const uiPhase = put('ui-sources','PBXSourcesBuildPhase',{buildActionMask:'2147483647',files:array([uiBuild]),runOnlyForDeploymentPostprocessing:0});
  const uiFrameworks = put('ui-frameworks','PBXFrameworksBuildPhase',{buildActionMask:'2147483647',files:'()',runOnlyForDeploymentPostprocessing:0});
  for (const name of ['Debug','Release']) {
    const settings = {SDKROOT:'iphoneos',IPHONEOS_DEPLOYMENT_TARGET:q('16.0'),SWIFT_VERSION:q('5.0'),TARGETED_DEVICE_FAMILY:q('1,2'),
      PRODUCT_BUNDLE_IDENTIFIER:q('dev.owngame.appUITests'),PRODUCT_NAME:q('owngameUITests'),GENERATE_INFOPLIST_FILE:'YES',CODE_SIGN_STYLE:'Automatic',TEST_TARGET_NAME:q('owngame'),SWIFT_OPTIMIZATION_LEVEL:q('-Onone')};
    put('ui:'+name,'XCBuildConfiguration',{buildSettings:'{ '+Object.entries(settings).map(([k,v])=>k+' = '+v+';').join(' ')+' }',name:q(name)});
  }
  const uiConfigs = put('ui-configs','XCConfigurationList',{buildConfigurations:array([id('ui:Debug'),id('ui:Release')]),defaultConfigurationIsVisible:0,defaultConfigurationName:'Release'});
  const uiProxy = put('ui-proxy','PBXContainerItemProxy',{containerPortal:id('project'),proxyType:1,remoteGlobalIDString:target,remoteInfo:q('owngame')});
  const uiDependency = put('ui-dependency','PBXTargetDependency',{target,targetProxy:uiProxy});
  const uiTarget = put('ui-target','PBXNativeTarget',{buildConfigurationList:uiConfigs,buildPhases:array([uiPhase,uiFrameworks]),buildRules:'()',dependencies:array([uiDependency]),name:q('owngameUITests'),productName:q('owngameUITests'),productReference:uiProduct,productType:q('com.apple.product-type.bundle.ui-testing')});
  put('project', 'PBXProject', {attributes:'{ LastUpgradeCheck = 1600; TargetAttributes = { '+uiTarget+' = { TestTargetID = '+target+'; }; }; }', buildConfigurationList:projectConfigs, compatibilityVersion:q('Xcode 14.0'), developmentRegion:q('en'), hasScannedForEncodings:0, knownRegions:array([q('en'),q('zh-Hans'),q('Base')]), mainGroup:group, productRefGroup:products, projectDirPath:q(''), projectRoot:q(''), targets:array([target,uiTarget])});
  const pbx = '// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n' + [...objects].map(([key,value]) => key + ' = ' + value + ';').join('\n') + '\n}; rootObject = ' + id('project') + '; }\n';
  const scheme = `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
 <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${target}" BuildableName="owngame.app" BlueprintName="owngame" ReferencedContainer="container:Owngame.xcodeproj"/></BuildActionEntry><BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${uiTarget}" BuildableName="owngameUITests.xctest" BlueprintName="owngameUITests" ReferencedContainer="container:Owngame.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction>
 <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${uiTarget}" BuildableName="owngameUITests.xctest" BlueprintName="owngameUITests" ReferencedContainer="container:Owngame.xcodeproj"/></TestableReference></Testables></TestAction>
 <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${target}" BuildableName="owngame.app" BlueprintName="owngame" ReferencedContainer="container:Owngame.xcodeproj"/></BuildableProductRunnable></LaunchAction>
 <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"/>
 <AnalyzeAction buildConfiguration="Debug"/>
 <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>\n`;
  return new Map([['Owngame.xcodeproj/project.pbxproj',pbx], ['Owngame.xcodeproj/xcshareddata/xcschemes/owngame.xcscheme',scheme]]);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [file, text] of await projectFiles()) {
    const target = path.join(root, 'apps/ios', file);
    await fs.mkdir(path.dirname(target), {recursive:true}); await fs.writeFile(target, text);
  }
  console.log('iOS project generated');
}
