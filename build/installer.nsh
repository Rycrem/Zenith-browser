; Pages et réglages propres à Zenith dans l'installateur Windows.
; - Langue choisie (français ou anglais) : écrite dans resources\default-lang.
; - Page « Confidentialité » : ce à quoi l'appli se connecte, et une case pour
;   désactiver les vérifications automatiques, écrite dans resources\default-autoupdate.
; Zenith lit ces fichiers au premier lancement ; « lang » et « update auto » les changent ensuite.

!include LogicLib.nsh

; Le détail de l'installation (fichiers copiés, réglages écrits) reste affiché pendant l'installation,
; et la page ne passe pas toute seule à la fin : on a le temps de le lire.
!macro customHeader
  ShowInstDetails show
  ShowUninstDetails show
  AutoCloseWindow false
!macroend

; electron-builder coupe le détail (SetDetailsPrint none) au tout début de l'installation, avant de
; décompresser les fichiers : on le rallume dès la vérification « Zenith est-il ouvert ? » qui suit,
; puis on fait cette vérification comme lui (avec ce qu'il n'inclut plus quand elle est personnalisée).
!include "getProcessInfo.nsh"
Var pid

!macro customCheckAppRunning
  ${IfNot} ${Silent}
    SetDetailsPrint both
  ${EndIf}
  ${If} $LANGUAGE == 1036
    DetailPrint "Vérification que Zenith est fermé…"
  ${Else}
    DetailPrint "Checking that Zenith is closed…"
  ${EndIf}
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
  !ifndef BUILD_UNINSTALLER
    ${If} $LANGUAGE == 1036
      DetailPrint "Installation des fichiers de Zenith dans $INSTDIR…"
    ${Else}
      DetailPrint "Installing Zenith files to $INSTDIR…"
    ${EndIf}
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
  !include MUI2.nsh
  !include nsDialogs.nsh

  Var DbAutoUpdate
  Var DbAutoUpdateBox

  !macro customPageAfterChangeDir
    Page custom DbPrivacyShow DbPrivacyLeave
  !macroend

  Function DbPrivacyShow
    ${If} $LANGUAGE == 1036
      !insertmacro MUI_HEADER_TEXT "Confidentialité" "Ce à quoi Zenith se connecte"
    ${Else}
      !insertmacro MUI_HEADER_TEXT "Privacy" "What Zenith connects to"
    ${EndIf}
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${If} $LANGUAGE == 1036
      ${NSD_CreateLabel} 0 0 100% 64u "Zenith ne collecte aucune donnée et n'a pas de télémétrie. Il se connecte tout seul à GitHub (nouvelle version de Zenith et de uBlock Origin) et au service de mise à jour du Chrome Web Store (extensions), à chaque lancement."
      Pop $0
      ${NSD_CreateCheckbox} 0 72u 100% 14u "Vérifier les mises à jour automatiquement (Zenith et extensions)"
    ${Else}
      ${NSD_CreateLabel} 0 0 100% 64u "Zenith collects no data and has no telemetry. At every launch it connects by itself to GitHub (new versions of Zenith and uBlock Origin) and to the Chrome Web Store update service (extensions)."
      Pop $0
      ${NSD_CreateCheckbox} 0 72u 100% 14u "Check for updates automatically (Zenith and extensions)"
    ${EndIf}
    Pop $DbAutoUpdateBox
    ${If} $DbAutoUpdate != "off"
      ${NSD_Check} $DbAutoUpdateBox
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function DbPrivacyLeave
    ${NSD_GetState} $DbAutoUpdateBox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $DbAutoUpdate "on"
    ${Else}
      StrCpy $DbAutoUpdate "off"
    ${EndIf}
  FunctionEnd
!endif

!macro customInstall
  ${IfNot} ${Silent}
    SetDetailsPrint both
  ${EndIf}
  ${If} $LANGUAGE == 1036
    DetailPrint "Fichiers de Zenith copiés dans $INSTDIR"
    DetailPrint "Langue de l'interface : français"
  ${Else}
    DetailPrint "Zenith files copied to $INSTDIR"
    DetailPrint "Interface language: English"
  ${EndIf}
  FileOpen $0 "$INSTDIR\resources\default-lang" w
  ${If} $LANGUAGE == 1036
    FileWrite $0 "fr"
  ${Else}
    FileWrite $0 "en"
  ${EndIf}
  FileClose $0
  ; Mise à jour silencieuse (/S, electron-updater) : pas de page, on n'écrit rien.
  !ifndef BUILD_UNINSTALLER
  ${IfNot} ${Silent}
    FileOpen $0 "$INSTDIR\resources\default-autoupdate" w
    ${If} $DbAutoUpdate == "off"
      FileWrite $0 "off"
      ${If} $LANGUAGE == 1036
        DetailPrint "Vérification automatique des mises à jour : désactivée"
      ${Else}
        DetailPrint "Automatic update check: off"
      ${EndIf}
    ${Else}
      FileWrite $0 "on"
      ${If} $LANGUAGE == 1036
        DetailPrint "Vérification automatique des mises à jour : activée"
      ${Else}
        DetailPrint "Automatic update check: on"
      ${EndIf}
    ${EndIf}
    FileClose $0
  ${EndIf}
  !endif
  ${If} $LANGUAGE == 1036
    DetailPrint "uBlock Origin est préinstallé (bloqueur de pub)"
    DetailPrint "Création des raccourcis du menu Démarrer et du bureau…"
  ${Else}
    DetailPrint "uBlock Origin is preinstalled (ad blocker)"
    DetailPrint "Creating Start menu and desktop shortcuts…"
  ${EndIf}
  !insertmacro zenithRegisterBrowser
!macroend

; Inscription comme navigateur, à chaque installation (chemin à jour) : Zenith apparaît dans les
; applications par défaut de Windows et dans « Ouvrir avec » quand une autre appli ouvre un lien.
!macro zenithRegisterBrowser
  ${If} $LANGUAGE == 1036
    DetailPrint "Inscription de Zenith comme navigateur web"
  ${Else}
    DetailPrint "Registering Zenith as a web browser"
  ${EndIf}
  StrCpy $1 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  StrCpy $2 "Software\Clients\StartMenuInternet\Zenith"
  WriteRegStr HKCU "$2" "" "Zenith"
  WriteRegStr HKCU "$2\DefaultIcon" "" '"$1",0'
  WriteRegStr HKCU "$2\shell\open\command" "" '"$1"'
  WriteRegStr HKCU "$2\Capabilities" "ApplicationName" "Zenith"
  WriteRegStr HKCU "$2\Capabilities" "ApplicationIcon" '"$1",0'
  WriteRegStr HKCU "$2\Capabilities" "ApplicationDescription" "Zenith web browser"
  WriteRegStr HKCU "$2\Capabilities\StartMenu" "StartMenuInternet" "Zenith"
  WriteRegStr HKCU "$2\Capabilities\URLAssociations" "http" "ZenithURL"
  WriteRegStr HKCU "$2\Capabilities\URLAssociations" "https" "ZenithURL"
  WriteRegStr HKCU "$2\Capabilities\FileAssociations" ".htm" "ZenithHTML"
  WriteRegStr HKCU "$2\Capabilities\FileAssociations" ".html" "ZenithHTML"
  WriteRegStr HKCU "Software\RegisteredApplications" "Zenith" "$2\Capabilities"
  !insertmacro zenithProgId "ZenithURL" "Zenith URL"
  WriteRegStr HKCU "Software\Classes\ZenithURL" "URL Protocol" ""
  !insertmacro zenithProgId "ZenithHTML" "Zenith HTML"
  WriteRegStr HKCU "Software\Classes\.htm\OpenWithProgids" "ZenithHTML" ""
  WriteRegStr HKCU "Software\Classes\.html\OpenWithProgids" "ZenithHTML" ""
  ; Windows relit les associations tout de suite, sans attendre une reconnexion.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro zenithProgId CLS LABEL
  WriteRegStr HKCU "Software\Classes\${CLS}" "" "${LABEL}"
  WriteRegStr HKCU "Software\Classes\${CLS}\DefaultIcon" "" '"$1",0'
  WriteRegStr HKCU "Software\Classes\${CLS}\shell\open\command" "" '"$1" "%1"'
  WriteRegStr HKCU "Software\Classes\${CLS}\Application" "ApplicationName" "Zenith"
  WriteRegStr HKCU "Software\Classes\${CLS}\Application" "ApplicationIcon" '"$1",0'
  WriteRegStr HKCU "Software\Classes\${CLS}\Application" "AppUserModelId" "${APP_ID}"
!macroend

; Désinstallation : retire l'inscription comme navigateur.
!macro customUnInstall
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Zenith"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Zenith"
  DeleteRegKey HKCU "Software\Classes\ZenithURL"
  DeleteRegKey HKCU "Software\Classes\ZenithHTML"
  DeleteRegValue HKCU "Software\Classes\.htm\OpenWithProgids" "ZenithHTML"
  DeleteRegValue HKCU "Software\Classes\.html\OpenWithProgids" "ZenithHTML"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
