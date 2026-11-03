#!/bin/sh
set -eu

project_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
godot_bin=${GODOT_BIN:-godot}
output="$project_dir/build/mobile-web"

cd "$project_dir"
mkdir -p "$output"
# Keep Godot from importing its own generated Web icon on repeat builds.
touch "$project_dir/build/.gdignore"
rm -f "$output/index.png.import"
"$godot_bin" --headless --path "$project_dir" --import
"$godot_bin" --headless --path "$project_dir" --export-release "Mobile Web" "$output/index.html"
for file in index.html index.js index.pck index.wasm; do
    test -s "$output/$file"
done
