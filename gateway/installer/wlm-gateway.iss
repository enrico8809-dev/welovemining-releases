; WLM Gateway — Windows installer (Inno Setup 6)
;
; The ONE on-site program. Bundles Node.js, cloudflared and the WinSW service
; wrapper. Auto-discovers the miners, serves a dashboard + the app API on
; localhost:8787, and runs its own tunnel so the app can reach it from anywhere.
; The dashboard shows the App address + token to paste into the app.

#define AppName "WLM Gateway"
#define AppVersion "3.0.0"

[Setup]
AppId={{B8E7B1C2-3D4F-4A5B-9C6D-1E2F3A4B5C6D}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=WeLoveMining
DefaultDirName={autopf}\WLM Gateway
DefaultGroupName=WLM Gateway
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=WLM-Gateway-Setup
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
Name: "{group}\WLM Gateway"; Filename: "{app}\WLM Site Manager.cmd"; IconFilename: "{app}\wlm.ico"
Name: "{group}\Uninstall WLM Gateway"; Filename: "{uninstallexe}"
Name: "{autodesktop}\WLM Gateway"; Filename: "{app}\WLM Site Manager.cmd"; IconFilename: "{app}\wlm.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "install"; Flags: runhidden waituntilterminated
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "start"; Flags: runhidden waituntilterminated
Filename: "{app}\WLM Site Manager.cmd"; Description: "Open the dashboard now"; Flags: postinstall shellexec nowait

[UninstallRun]
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopSvc"
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveSvc"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  SitePage: TInputQueryWizardPage;
  AccessToken: String;
  ViewToken: String;

function GenToken(const Salt: String): String;
begin
  Result := GetMD5OfString(Salt + GetDateTimeString('yyyy-mm-dd hh:nn:ss.zzz', '-', ':'));
end;

procedure InitializeWizard();
begin
  AccessToken := GenToken('full');
  ViewToken := GenToken('view');
  SitePage := CreateInputQueryPage(wpWelcome,
    'Site setup', 'Name this site',
    'The gateway finds the miners on this network automatically and creates a free public address so the app can reach it (shown on the dashboard after install).' + #13#10 + #13#10 +
    'For a permanent custom address, paste a Cloudflare connection code; otherwise leave it blank. The app access token below is generated for you.');
  SitePage.Add('Site name (shows in the app):', False);
  SitePage.Add('Cloudflare connection code (optional):', False);
  SitePage.Add('App access token (copy this):', False);
  SitePage.Values[0] := 'My Mining Site';
  SitePage.Values[2] := AccessToken;
end;

function JsonEscape(const S: String): String;
begin
  Result := S;
  StringChangeEx(Result, '\', '\\', True);
  StringChangeEx(Result, '"', '\"', True);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigPath, SiteName, CfToken, Token, QuickStr, Json: String;
begin
  if CurStep = ssPostInstall then
  begin
    ConfigPath := ExpandConstant('{app}\config.json');
    if not FileExists(ConfigPath) then
    begin
      SiteName := Trim(SitePage.Values[0]);
      if SiteName = '' then SiteName := 'My Mining Site';
      CfToken := Trim(SitePage.Values[1]);
      Token := Trim(SitePage.Values[2]);
      if Token = '' then Token := AccessToken;
      if CfToken = '' then QuickStr := 'true' else QuickStr := 'false';
      Json :=
        '{' + #13#10 +
        '  "siteName": "' + JsonEscape(SiteName) + '",' + #13#10 +
        '  "listenPort": 8787,' + #13#10 +
        '  "pollIntervalSec": 10,' + #13#10 +
        '  "discoveryIntervalSec": 300,' + #13#10 +
        '  "discover": true,' + #13#10 +
        '  "quickTunnel": ' + QuickStr + ',' + #13#10 +
        '  "tunnelToken": "' + JsonEscape(CfToken) + '",' + #13#10 +
        '  "publicUrl": "",' + #13#10 +
        '  "token": "' + Token + '",' + #13#10 +
        '  "viewToken": "' + ViewToken + '",' + #13#10 +
        '  "subnets": [],' + #13#10 +
        '  "miners": []' + #13#10 +
        '}' + #13#10;
      SaveStringToFile(ConfigPath, Json, False);
    end;
  end;
end;
