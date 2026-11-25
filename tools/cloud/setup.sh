#!/bin/bash
# usage: setup.sh <node-mirror-base>
set -e
V=v24.13.1
BASE=${1:-https://nodejs.org/dist}
cd /opt
if [ ! -x /opt/node/bin/node ]; then
  curl -fsSL "$BASE/$V/node-$V-linux-x64.tar.xz" -o node.tar.xz
  tar -xJf node.tar.xz && rm node.tar.xz && mv node-$V-linux-x64 node
fi
ln -sf /opt/node/bin/node /usr/local/bin/node
ln -sf /opt/node/bin/npm /usr/local/bin/npm
mkdir -p /work /work/tmp && chmod 777 /work /work/tmp
node -v
