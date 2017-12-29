#!/bin/bash

set -e

cd libwally-core

echo '============================================================'
echo 'Initialising build:'
echo '============================================================'
tools/cleanup.sh
tools/autogen.sh

configure_opts="--disable-dependency-tracking --enable-js-wrappers --disable-swig-java --disable-swig-python"

./configure $configure_opts
make clean
make
cd ..
