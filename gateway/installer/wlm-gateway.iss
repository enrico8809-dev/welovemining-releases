; WLM Site Manager — Windows installer (Inno Setup 6)
;
; One-click install for client sites. Bundles Node.js, cloudflared and the
; WinSW service wrapper. The wizard asks only for a site name and an optional
; "connection code" (a Cloudflare named-tunnel token the WLM operator hands
; out for a permanent address). With no code, a free instant tunnel is used
; and the public address is shown on the dashboard.
;
; CI stages the payload (node.exe, cloudflared.exe, wlm-gateway-service.exe,
; server.js, config.example.json, README.md, service xml, launcher, icon)
; into "payload" next to this script before ISCC runs.

#define AppName "WLM Site Manager"
#define AppVersion "2.0.0"

[Setup]
AppId={{B8E7B1C2-3D4F-4A5B-9C6D-1E2F3A4B5C6D}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=WeLoveMining
DefaultDirName={autopf}\WLM Site Manager
DefaultGroupName=WLM Site Manager
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=WLM-SiteManager-Setup
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
Name: "{group}\WLM Site Manager"; Filename: "{app}\WLM Site Manager.cmd"; IconFilename: "{app}\wlm.ico"
Name: "{group}\Uninstall WLM Site Manager"; Filename: "{uninstallexe}"
Name: "{autodesktop}\WLM Site Manager"; Filename: "{app}\WLM Site Manager.cmd"; IconFilename: "{app}\wlm.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "install"; Flags: runhidden waituntilterminated
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "start"; Flags: runhidden waituntilterminated
Filename: "{app}\WLM Site Manager.cmd"; Description: "Open WLM Site Manager now"; Flags: postinstall shellexec nowait

[UninstallRun]
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopSvc"
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveSvc"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  SitePage: TInputQueryWizardPage;
  AccessToken: String;

function GenToken(): String;
begin
  Result := GetMD5OfString(GetDateTimeString('yyyy-mm-dd hh:nn:ss.zzz', '-', ':'));
end;

procedure InitializeWizard();
begin
  AccessToken := GenToken();
  SitePage := CreateInputQueryPage(wpWelcome,
    'Site setup', 'Name this site and connect it',
    'Give this mining site a name (it shows in the app). If WeLoveMining gave you a connection code, paste it for a permanent address — otherwise leave it blank and a free address is created automatically (shown on the dashboard after install).' + #13#10 + #13#10 +
    'The app access token below links the phone app to this site — copy it now.');
  SitePage.Add('Site name:', False);
  SitePage.Add('Connection code (optional):', False);
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
  ConfigPath, Token, CfToken, SiteName, QuickStr, Json: String;
begin
  if CurStep = ssPostInstall then
  begin
    ConfigPath := ExpandConstant('{app}\config.json');
    // Preserve an existing config (and its token) across upgrades.
    if not FileExists(ConfigPath) then
    begin
      Token := Trim(SitePage.Values[2]);
      if Token = '' then Token := AccessToken;
      CfToken := Trim(SitePage.Values[1]);
      SiteName := Trim(SitePage.Values[0]);
      if SiteName = '' then SiteName := 'My Mining Site';
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
        '  "token": "' + Token + '",' + #13#10 +
        '  "subnets": [],' + #13#10 +
        '  "miners": []' + #13#10 +
        '}' + #13#10;
      SaveStringToFile(ConfigPath, Json, False);
    end;
  end;
end;
