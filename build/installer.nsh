; Pages et réglages propres à Zenith dans l'installateur Windows.
; - Langue choisie (français ou anglais) : écrite dans resources\default-lang.
; - Page « Confidentialité » : ce à quoi l'appli se connecte, et une case pour
;   désactiver les vérifications automatiques, écrite dans resources\default-autoupdate.
; Zenith lit ces fichiers au premier lancement ; « lang » et « update auto » les changent ensuite.

!include LogicLib.nsh

; Le détail de l'installation (fichiers copiés, réglages écrits) reste affiché pendant l'installation.
!macro customHeader
  ShowInstDetails show
  ShowUninstDetails show
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
  ; electron-builder coupe le détail (SetDetailsPrint none) au début de l'installation : on le rallume.
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
!macroend

; Désinstallation : retire aussi l'inscription comme navigateur (commande « default »).
!macro customUnInstall
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Zenith"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Zenith"
  DeleteRegKey HKCU "Software\Classes\ZenithURL"
  DeleteRegKey HKCU "Software\Classes\ZenithHTML"
!macroend
