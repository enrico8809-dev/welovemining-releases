; WLM Hub — Windows installer (Inno Setup 6)
;
; Installs the central Hub on an always-on PC. Bundles Node.js, cloudflared and
; the WinSW service wrapper. Generates an operator token and (optionally) opens
; ONE Cloudflare tunnel for the Hub's public address. Site agents dial in to it.

#define AppName "WLM Hub"
#define AppVersion "1.0.0"

[Setup]
AppId={{C9F8A2D4-7E6B-4C3A-8D1E-2F3A4B5C6D7E}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=WeLoveMining
DefaultDirName={autopf}\WLM Hub
DefaultGroupName=WLM Hub
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=WLM-Hub-Setup
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

[Icons]
Name: "{group}\WLM Hub"; Filename: "{app}\WLM Hub.cmd"; IconFilename: "{app}\wlm.ico"
Name: "{autodesktop}\WLM Hub"; Filename: "{app}\WLM Hub.cmd"; IconFilename: "{app}\wlm.ico"
Name: "{group}\Uninstall WLM Hub"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\wlm-hub-service.exe"; Parameters: "install"; Flags: runhidden waituntilterminated
Filename: "{app}\wlm-hub-service.exe"; Parameters: "start"; Flags: runhidden waituntilterminated
Filename: "{app}\WLM Hub.cmd"; Description: "Open the Hub dashboard now"; Flags: postinstall shellexec nowait

[UninstallRun]
Filename: "{app}\wlm-hub-service.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopSvc"
Filename: "{app}\wlm-hub-service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveSvc"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  HubPage: TInputQueryWizardPage;
  OperatorToken: String;

function GenToken(): String;
begin
  Result := GetMD5OfString(GetDateTimeString('yyyy-mm-dd hh:nn:ss.zzz', '-', ':')) +
            GetMD5OfString(GetDateTimeString('zzz hh:nn:ss', '-', ':'));
end;

procedure InitializeWizard();
begin
  OperatorToken := GenToken();
  HubPage := CreateInputQueryPage(wpWelcome,
    'Hub setup', 'Operator token and public address',
    'The operator token below logs the web dashboard and your app into the Hub — copy it now and keep it secret.' + #13#10 + #13#10 +
    'For the Hub''s public address, paste a Cloudflare Tunnel connection code (recommended for a permanent address like manage.welovemining.co.za). Leave it blank to use a free instant address shown on the dashboard.');
  HubPage.Add('Operator token (copy this):', False);
  HubPage.Add('Cloudflare connection code (optional):', False);
  HubPage.Values[0] := OperatorToken;
end;

function JsonEscape(const S: String): String;
begin
  Result := S;
  StringChangeEx(Result, '\', '\\', True);
  StringChangeEx(Result, '"', '\"', True);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigPath, Token, CfToken, Json: String;
begin
  if CurStep = ssPostInstall then
  begin
    ConfigPath := ExpandConstant('{app}\config.json');
    if not FileExists(ConfigPath) then
    begin
      Token := Trim(HubPage.Values[0]);
      if Token = '' then Token := OperatorToken;
      CfToken := Trim(HubPage.Values[1]);
      Json :=
        '{' + #13#10 +
        '  "listenPort": 8900,' + #13#10 +
        '  "operatorToken": "' + JsonEscape(Token) + '",' + #13#10 +
        '  "offlineAfterSec": 60,' + #13#10 +
        '  "tunnel": true,' + #13#10 +
        '  "tunnelToken": "' + JsonEscape(CfToken) + '",' + #13#10 +
        '  "publicUrl": "",' + #13#10 +
        '  "siteKeys": {}' + #13#10 +
        '}' + #13#10;
      SaveStringToFile(ConfigPath, Json, False);
    end;
  end;
end;
