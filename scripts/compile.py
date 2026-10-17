from pathlib import Path
import subprocess,sys
root,tools,build=map(Path,sys.argv[1:])
platform=tools/'platforms/android-35/android.jar'
sources=list((root/'app/src/main/java').rglob('*.java'))+list((build/'generated').rglob('*.java'))
subprocess.run(['java','-jar',str(tools/'ecj-3.39.0.jar'),'-8','-proc:none','-warn:none','-bootclasspath',str(platform),'-d',str(build/'classes'),*[str(p) for p in sources]],check=True)
classes=[str(p) for p in (build/'classes').rglob('*.class')]
subprocess.run(['java','-cp',str(tools/'build-tools/35.0.0/lib/d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib',str(platform),'--output',str(build/'dex'),*classes],check=True)
