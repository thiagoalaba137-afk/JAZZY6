#!/usr/bin/env python3
"""Download pinned build tools from Google and Eclipse's Maven Central artifact.

The manual APK build needs a Java 17+ runtime, not a full Android Studio install.
Downloads follow the host's normal proxy/CA settings and verify upstream hashes.
"""
import hashlib
import os
from pathlib import Path
import shutil
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.tools').resolve()
root.mkdir(parents=True, exist_ok=True)
downloads = root / 'downloads'
downloads.mkdir(exist_ok=True)

def fetch(url, path):
    print('Downloading', url.rsplit('/', 1)[-1], flush=True)
    with urllib.request.urlopen(url, timeout=90) as source, open(path, 'wb') as target:
        shutil.copyfileobj(source, target)

def extract(path, destination):
    with zipfile.ZipFile(path) as archive:
        for item in archive.infolist():
            target = (destination / item.filename).resolve()
            if not target.is_relative_to(destination.resolve()):
                raise RuntimeError('Unsafe archive entry')
            archive.extract(item, destination)
            mode = item.external_attr >> 16
            if mode and target.is_file():
                os.chmod(target, mode & 0o777)

repo = downloads / 'repository.xml'
fetch('https://dl.google.com/android/repository/repository2-1.xml', repo)
tree = ET.parse(repo)
for package, destination, marker in [
    ('platforms;android-35', root/'platforms'/'android-35', 'android.jar'),
    ('build-tools;35.0.0', root/'build-tools'/'35.0.0', 'aapt2'),
]:
    if (destination/marker).exists():
        print('Already available:', package)
        continue
    element = next(e for e in tree.getroot() if e.attrib.get('path') == package)
    archive = next(a for a in element.iter('archive') if a.findtext('host-os') in [None, 'linux'])
    complete = archive.find('complete')
    name = complete.findtext('url')
    checksum = complete.find('checksum')
    path = downloads/name
    fetch('https://dl.google.com/android/repository/'+name, path)
    algorithm = checksum.attrib.get('type', 'sha1').replace('-', '')
    if hashlib.new(algorithm, path.read_bytes()).hexdigest() != checksum.text.strip():
        raise RuntimeError('Android tool checksum mismatch')
    staging = downloads/(package.replace(';', '-')+'-unpacked')
    staging.mkdir(exist_ok=True)
    extract(path, staging)
    source = next(staging.rglob(marker)).parent
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, destination, dirs_exist_ok=True)
    print('Installed:', package, flush=True)

compiler = root/'ecj-3.39.0.jar'
base = 'https://repo.maven.apache.org/maven2/org/eclipse/jdt/ecj/3.39.0/ecj-3.39.0.jar'
if not compiler.exists():
    fetch(base, compiler)
    with urllib.request.urlopen(base+'.sha1', timeout=30) as source:
        checksum=source.read().decode().strip().split()[0]
    if hashlib.sha1(compiler.read_bytes()).hexdigest() != checksum:
        raise RuntimeError('Compiler checksum mismatch')
print('Android tools ready:', root)
