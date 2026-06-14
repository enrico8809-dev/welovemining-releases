; WLM Site Agent — Windows installer (Inno Setup 6)
;
; Installs at each client mining site. Bundles Node.js + the WinSW service
; wrapper. The agent dials OUT to the WLM Hub (no Cloudflare, no inbound) and
; also serves a local dashboard at http://localhost:8787 for on-site staff.
;
; CI stages the payload into "payload" next to this script before ISCC runs.

#define AppName "WLM Site Agent"
#define AppVersion "3.0.0"

[Setup]
AppId={{B8E7B1C2-3D4F-4A5B-9C6D-1E2F3A4B5C6D}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=WeLoveMining
DefaultDirName={autopf}\WLM Site Agent
DefaultGroupName=WLM Site Agent
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=WLM-SiteAgent-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
SetupIconFile=wlm.ico
UninstallDisplayIcon={app}\wlm.ico

[Files]
Source: "payload\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"

[Icons]
Name: "{group}\WLM Site Agent"; Filename: "{app}\WLM Site Manager.cmd"; IconFilename: "{app}\wlm.ico"
Name: "{group}\Uninstall WLM Site Agent"; Filename: "{uninstallexe}"
Name: "{autodesktop}\WLM Site Agent"; Filename: "{app}\WLM Site Manager.cmd"; IconFilename: "{app}\wlm.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "install"; Flags: runhidden waituntilterminated
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "start"; Flags: runhidden waituntilterminated
Filename: "{app}\WLM Site Manager.cmd"; Description: "Open the local dashboard"; Flags: postinstall shellexec nowait

[UninstallRun]
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopSvc"
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveSvc"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  SitePage: TInputQueryWizardPage;
  SiteKey: String;

function GenKey(): String;
begin
  Result := GetMD5OfString(GetDateTimeString('yyyy-mm-dd hh:nn:ss.zzz', '-', ':'));
end;

procedure InitializeWizard();
begin
  SiteKey := GenKey();
  SitePage := CreateInputQueryPage(wpWelcome,
    'Connect this site', 'Name the site and point it at your WLM Hub',
    'The agent finds the miners on this network and reports them to your WLM Hub. It dials out — nothing to open on the firewall, no Cloudflare here.');
  SitePage.Add('Site name (shows in the app):', False);
  SitePage.Add('WLM Hub address:', False);
  SitePage.Values[0] := 'My Mining Site';
  SitePage.Values[1] := 'https://manage.welovemining.co.za';
end;

function JsonEscape(const S: String): String;
begin
  Result := S;
  StringChangeEx(Result, '\', '\\', True);
  StringChangeEx(Result, '"', '\"', True);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigPath, SiteName, HubUrl, Json: String;
begin
  if CurStep = ssPostInstall then
  begin
    ConfigPath := ExpandConstant('{app}\config.json');
    if not FileExists(ConfigPath) then
    begin
      SiteName := Trim(SitePage.Values[0]);
      if SiteName = '' then SiteName := 'My Mining Site';
      HubUrl := Trim(SitePage.Values[1]);
      Json :=
        '{' + #13#10 +
        '  "siteName": "' + JsonEscape(SiteName) + '",' + #13#10 +
        '  "hubUrl": "' + JsonEscape(HubUrl) + '",' + #13#10 +
        '  "siteKey": "' + SiteKey + '",' + #13#10 +
        '  "reportIntervalSec": 10,' + #13#10 +
        '  "listenPort": 8787,' + #13#10 +
        '  "pollIntervalSec": 10,' + #13#10 +
        '  "discoveryIntervalSec": 300,' + #13#10 +
        '  "discover": true,' + #13#10 +
        '  "subnets": [],' + #13#10 +
        '  "miners": []' + #13#10 +
        '}' + #13#10;
      SaveStringToFile(ConfigPath, Json, False);
    end;
  end;
end;
