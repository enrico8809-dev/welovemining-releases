; WLM Gateway — Windows installer (Inno Setup 6)
;
; Bundles Node.js, cloudflared and the WinSW service wrapper, installs the
; gateway as an auto-starting Windows service, writes config.json with a
; generated access token, and (if a Cloudflare Tunnel token is entered)
; installs cloudflared as a service so the site is reachable remotely.
;
; The build payload (node.exe, cloudflared.exe, wlm-gateway-service.exe,
; server.js, package.json, config.example.json, README.md, the service .xml)
; is staged into a "payload" folder next to this script by CI before ISCC runs.

#define AppName "WLM Gateway"
#define AppVersion "1.0.0"

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

[Files]
Source: "payload\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\Uninstall WLM Gateway"; Filename: "{uninstallexe}"

[Run]
; Install + start the gateway service (WinSW).
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "install"; Flags: runhidden waituntilterminated
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "start"; Flags: runhidden waituntilterminated
; Install the Cloudflare tunnel connector as a service, only if a token was given.
Filename: "{app}\cloudflared.exe"; Parameters: "service install {code:GetCfToken}"; Check: CloudflareProvided; Flags: runhidden waituntilterminated
Filename: "http://localhost:8787/"; Description: "Open the gateway status page"; Flags: postinstall shellexec nowait

[UninstallRun]
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopSvc"
Filename: "{app}\wlm-gateway-service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveSvc"
Filename: "{app}\cloudflared.exe"; Parameters: "service uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveCf"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  CfPage: TInputQueryWizardPage;
  AccessToken: String;

function GenToken(): String;
begin
  // Unique-per-install token derived from host + time (no RNG seed available
  // in Inno's Pascal Script). MD5 gives a 32-char hex string.
  Result := GetMD5OfString(GetDateTimeString('yyyy-mm-dd hh:nn:ss.zzz', '-', ':'));
end;

procedure InitializeWizard();
begin
  AccessToken := GenToken();
  CfPage := CreateInputQueryPage(wpWelcome,
    'Connectivity',
    'Cloudflare tunnel and app access token',
    'To reach this site remotely, paste the Cloudflare Tunnel connector token (from the Cloudflare Zero Trust dashboard). Leave it blank to set up the tunnel later.' + #13#10 + #13#10 +
    'The app access token below is generated for you — copy it into the Android app under Settings -> Access token.');
  CfPage.Add('Cloudflare Tunnel token (optional):', False);
  CfPage.Add('App access token (copy this):', False);
  CfPage.Values[1] := AccessToken;
end;

function GetCfToken(Param: String): String;
begin
  Result := Trim(CfPage.Values[0]);
end;

function CloudflareProvided(): Boolean;
begin
  Result := Trim(CfPage.Values[0]) <> '';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigPath, Token, Json: String;
begin
  if CurStep = ssPostInstall then
  begin
    ConfigPath := ExpandConstant('{app}\config.json');
    // Preserve an existing config (and its token) across upgrades.
    if not FileExists(ConfigPath) then
    begin
      Token := Trim(CfPage.Values[1]);
      if Token = '' then
        Token := AccessToken;
      Json :=
        '{' + #13#10 +
        '  "listenPort": 8787,' + #13#10 +
        '  "pollIntervalSec": 10,' + #13#10 +
        '  "discoveryIntervalSec": 300,' + #13#10 +
        '  "discover": true,' + #13#10 +
        '  "token": "' + Token + '",' + #13#10 +
        '  "subnets": [],' + #13#10 +
        '  "miners": []' + #13#10 +
        '}' + #13#10;
      SaveStringToFile(ConfigPath, Json, False);
    end;
  end;
end;
