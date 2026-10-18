import fs from 'node:fs/promises';
const pkg=JSON.parse(await fs.readFile('package.json'));
if(process.env.RELEASE_VERSION!==pkg.version)throw Error('Requested version differs from package.json');
if(!pkg.repository?.url?.startsWith('https://github.com/'))throw Error('Set the real public repository before release');
if(!pkg.bugs?.url||pkg.license!=='MIT')throw Error('Missing release metadata');
if(process.env.GITHUB_REPOSITORY&&pkg.repository.url!==`https://github.com/${process.env.GITHUB_REPOSITORY}.git`)throw Error('Repository metadata does not match this workflow');
console.log(JSON.stringify({version:pkg.version,repository:pkg.repository.url}));
