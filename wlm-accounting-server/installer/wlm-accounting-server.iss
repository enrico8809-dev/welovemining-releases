; WLM Accounting — sync server, Windows installer (Inno Setup 6)
;
; One double-click instead of the ten-step procedure the README used to be:
; installs Node, the server and the tunnel, registers both as services so they
; survive a reboot, and leaves a status shortcut that says which half is down
; when something is.
;
; Nothing here is exposed on the network by the server itself — it listens on
; loopback only. The Cloudflare tunnel connects outwards from this PC, so no
; router port is forwarded and the machine is never directly reachable.

#define AppName "WLM Accounting Server"
#define AppVersion "1.0.0"

[Setup]
AppId={{7C4A1E92-6B83-4D17-9F5A-2C8E3B6D4A10}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=WeLoveMining
DefaultDirName={autopf}\WLM Accounting Server
DefaultGroupName=WLM Accounting Server
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=WLM-Accounting-Server-Setup
Compression=lzma2
SolidCompression=yes
; A Windows service needs an administrator to register it.
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
SetupIconFile=wlm.ico
UninstallDisplayIcon={app}\wlm.ico

[Files]
Source: "payload\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\Server status"; Filename: "{app}\Server status.cmd"; IconFilename: "{app}\wlm.ico"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\WLM Accounting Server status"; Filename: "{app}\Server status.cmd"; IconFilename: "{app}\wlm.ico"

; The service is registered from [Code] instead of here, so that it can only
; happen after the port has been written into its configuration — a service
; started on a file still holding {{PORT}} fails to parse and looks broken.
[Run]
Filename: "{app}\Server status.cmd"; Description: "Check it's running now"; Flags: postinstall shellexec nowait

[UninstallRun]
Filename: "{app}\wlm-accounting-service.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopSvc"
Filename: "{app}\wlm-accounting-service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveSvc"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  SetupPage: TInputQueryWizardPage;

procedure InitializeWizard();
begin
  SetupPage := CreateInputQueryPage(wpWelcome,
    'How the apps will reach this PC',
    'The books live here; the phone and the Windows app sync against them.',
    'The server itself only listens on this machine. To let the phone reach it from anywhere, Cloudflare makes an outbound connection — so nothing is opened on your router.' + #13#10 + #13#10 +
    'ALREADY RUNNING A TUNNEL ON THIS PC (for the CRM, say)? Then leave the token box EMPTY. One tunnel serves as many hostnames as you like: in Cloudflare, open that tunnel and add a public hostname whose service is http://127.0.0.1 and the port below. Nothing needs installing here — the tunnel already running picks it up.' + #13#10 + #13#10 +
    'NO TUNNEL ON THIS PC YET? In Cloudflare: Zero Trust, Networks, Tunnels, Create a tunnel. Give it a public hostname pointing at http://127.0.0.1 and the port below, then paste its connector token here and this installer sets the tunnel up for you.' + #13#10 + #13#10 +
    'Either way, fill in the hostname so the status window can check it. The port must match what Cloudflare points at.');
  SetupPage.Add('Hostname you chose (e.g. accounting.welovemining.co.za):', False);
  SetupPage.Add('Cloudflare connector token:', False);
  SetupPage.Add('Port on this PC:', False);
  SetupPage.Values[2] := '4600';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Port: Integer;
begin
  Result := True;
  if CurPageID = SetupPage.ID then
  begin
    Port := StrToIntDef(Trim(SetupPage.Values[2]), 0);
    if (Port < 1) or (Port > 65535) then
    begin
      MsgBox('That port number is not usable. 4600 is the default.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function DataDir(): String;
begin
  // Not %APPDATA%: a service runs as LocalSystem, whose profile is buried under
  // system32. Books you can't find are books you can't back up.
  Result := ExpandConstant('{commonappdata}\WLM Accounting');
end;

procedure WriteServiceConfig(const Port: String);
var
  Raw: AnsiString;
  Xml, Path: String;
begin
  // One service definition, in the file that ships with it. The installer only
  // fills in what was chosen here.
  Path := ExpandConstant('{app}\wlm-accounting-service.xml');
  if not LoadStringFromFile(Path, Raw) then
  begin
    MsgBox('The service configuration file is missing from the installation.', mbError, MB_OK);
    Exit;
  end;

  Xml := String(Raw);
  StringChangeEx(Xml, '{{PORT}}', Port, True);
  StringChangeEx(Xml, '{{DATADIR}}', DataDir(), True);
  SaveStringToFile(Path, AnsiString(Xml), False);
end;

procedure WriteStatusSettings(const Port, Host: String);
var
  Lines: String;
begin
  // What the status shortcut needs to know to check both halves.
  Lines :=
    '@echo off' + #13#10 +
    'set WLM_PORT=' + Port + #13#10 +
    'set WLM_HOST=' + Host + #13#10 +
    'set WLM_DATA_DIR=' + DataDir() + #13#10;
  SaveStringToFile(ExpandConstant('{app}\settings.cmd'), AnsiString(Lines), False);
end;

procedure InstallService();
var
  Exe: String;
  Code: Integer;
  Ran: Boolean;
begin
  Exe := ExpandConstant('{app}\wlm-accounting-service.exe');

  // Re-running the installer over an existing install is the normal way to
  // upgrade, and WinSW refuses to install a service that is already there — so
  // clear it out first. Both calls are expected to fail on a first install.
  Ran := Exec(Exe, 'stop', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Ran := Exec(Exe, 'uninstall', '', SW_HIDE, ewWaitUntilTerminated, Code);

  if not Exec(Exe, 'install', '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then
  begin
    MsgBox('The server could not be registered as a Windows service (code ' + IntToStr(Code) + ').' + #13#10 + #13#10 +
           'Everything is installed; only the service is missing. From a command prompt as administrator:' + #13#10 + #13#10 +
           '"' + Exe + '" install' + #13#10 +
           '"' + Exe + '" start', mbError, MB_OK);
    Exit;
  end;

  if not Exec(Exe, 'start', '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then
    MsgBox('The service is registered but would not start (code ' + IntToStr(Code) + ').' + #13#10 + #13#10 +
           'The log says why:' + #13#10 +
           ExpandConstant('{app}\wlm-accounting-service.out.log'), mbError, MB_OK);
end;

function ServiceExists(const Name: String): Boolean;
var
  Code: Integer;
begin
  // sc.exe answers 0 when the service is there and 1060 when it isn't.
  Result := Exec(ExpandConstant('{sys}\sc.exe'), 'query ' + Name, '',
                 SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
end;

procedure InstallTunnel(const Token: String);
var
  Code: Integer;
begin
  if Token = '' then Exit;

  // A second `service install` does not add a second tunnel — it fights with
  // the service that is already there. On a PC where the CRM reaches the
  // outside through its own tunnel, that would take the CRM down to put the
  // books up. One tunnel can carry both hostnames, so the right move is to add
  // a hostname to the existing one, and this installer must not touch it.
  if ServiceExists('cloudflared') then
  begin
    MsgBox('This PC already runs a Cloudflare tunnel, so the token was ignored — deliberately.' + #13#10 + #13#10 +
           'Installing a second tunnel service here would disturb the one already running, which is likely what your CRM goes through.' + #13#10 + #13#10 +
           'Instead, in Cloudflare open the tunnel this PC already uses, and add a public hostname:' + #13#10 +
           '    Service: HTTP   ->   127.0.0.1:' + Trim(SetupPage.Values[2]) + #13#10 + #13#10 +
           'It starts working within seconds, with nothing further to install. The server itself is installed and running.',
           mbInformation, MB_OK);
    Exit;
  end;

  // `service install <token>` is the whole tunnel setup in one call: no login,
  // no credentials file to keep safe, no config.yml. Cloudflare holds which
  // hostname maps to which port.
  if not Exec(ExpandConstant('{app}\cloudflared.exe'), 'service install ' + Token,
              '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then
    MsgBox('The tunnel could not be installed (code ' + IntToStr(Code) + ').' + #13#10 + #13#10 +
           'The server itself is installed and running. Check the token and run this from a command prompt as administrator:' + #13#10 + #13#10 +
           '"' + ExpandConstant('{app}\cloudflared.exe') + '" service install <your token>',
           mbError, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Port, Host, Token: String;
begin
  if CurStep = ssPostInstall then
  begin
    Port := Trim(SetupPage.Values[2]);
    if Port = '' then Port := '4600';
    Host := Trim(SetupPage.Values[0]);
    Token := Trim(SetupPage.Values[1]);

    ForceDirectories(DataDir());
    WriteServiceConfig(Port);
    WriteStatusSettings(Port, Host);
    InstallService();
    InstallTunnel(Token);
  end;
end;
