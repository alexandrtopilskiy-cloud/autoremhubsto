#define ProductName "AutoRemHub СТО"
[Setup]
AppId=AutoRemHub-STO-Offline-Cabinet
AppName={#ProductName}
AppVersion=1.0.0
AppPublisher=AutoRemHub
DefaultDirName={localappdata}\Programs\AutoRemHub STO
DefaultGroupName={#ProductName}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
AllowNetworkDrive=no
AllowUNCPath=no
AllowRootDirectory=no
OutputDir=..\dist
OutputBaseFilename=AutoRemHub-Setup-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\runtime\AutoRemHub.exe

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Files]
Source: "..\desktop-stage\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\AutoRemHub СТО"; Filename: "{app}\runtime\AutoRemHub.exe"; Parameters: """{app}\desktop"" ""--offline-data={code:GetDataDir}"""
Name: "{userdesktop}\AutoRemHub СТО"; Filename: "{app}\runtime\AutoRemHub.exe"; Parameters: """{app}\desktop"" ""--offline-data={code:GetDataDir}"""

[Run]
Filename: "{app}\runtime\AutoRemHub.exe"; Parameters: """{app}\desktop"" ""--offline-data={code:GetDataDir}"""; Description: "Открыть AutoRemHub СТО"; Flags: postinstall nowait skipifsilent

[Code]
var
  DataPage: TInputDirWizardPage;

procedure InitializeWizard;
var
  DefaultData: String;
begin
  DefaultData := GetPreviousData('DataDir', ExpandConstant('{localappdata}\AutoRemHub STO\Data'));
  DataPage := CreateInputDirPage(wpSelectDir, 'Локальная база данных',
    'Выберите отдельную папку для данных СТО.',
    'В этой папке программа создаст подпапку AutoRemHub-Cabinet. Удаление программы сохраняет базу.',
    False, 'Новая папка');
  DataPage.Add('');
  DataPage.Values[0] := ExpandConstant('{param:DATADIR|' + DefaultData + '}');
end;

function GetDataDir(Param: String): String;
begin
  Result := RemoveBackslashUnlessRoot(DataPage.Values[0]);
end;

function DataDirError: String;
var
  DataDir, AppDir: String;
begin
  Result := '';
  DataDir := AddBackslash(Lowercase(GetDataDir('')));
  AppDir := AddBackslash(Lowercase(WizardDirValue));
  if (Length(DataDir) < 4) or (Copy(DataDir, 2, 2) <> ':\') or
      (Pos('..\', DataDir) > 0) then
    Result := 'Выберите отдельную папку на локальном диске.'
  else if (Pos(AppDir, DataDir) = 1) or (Pos(DataDir, AppDir) = 1) then
    Result := 'Папки программы и базы должны находиться отдельно друг от друга.';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Error: String;
begin
  Result := True;
  if CurPageID = DataPage.ID then begin
    Error := DataDirError;
    if Error <> '' then begin
      MsgBox(Error, mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := DataDirError;
end;

procedure RegisterPreviousData(PreviousDataKey: Integer);
begin
  SetPreviousData(PreviousDataKey, 'DataDir', GetDataDir(''));
end;
