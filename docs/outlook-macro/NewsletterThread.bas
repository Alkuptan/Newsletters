Attribute VB_Name = "NewsletterThread"
' =====================================================================
'  Unit Newsletter Studio — send this cycle's newsletter as a REPLY
'  in the same email thread as the last one.
'
'  WHAT IT IS FOR
'  The tool builds a finished message file (.eml): addressed, written,
'  newsletter in the body, PDF attached. Opening that file gives a NEW
'  message, so each cycle starts its own thread. This macro turns it
'  into a genuine reply to the previous newsletter for that unit, so
'  the client sees one growing conversation instead of fifty separate
'  emails.
'
'  IT NEVER SENDS. It opens the draft for you to read and press Send.
'
'  HOW IT WORKS
'    1. Finds the newest .eml the tool downloaded.
'    2. Reads its subject, recipients, wording and attachments.
'    3. Looks in Sent Items for the last message with the same subject.
'    4. Found     -> Reply All on it, so Outlook sets the hidden headers
'                    that make it a real reply, then puts this cycle's
'                    wording and files at the top.
'       Not found -> opens the message as it is. First time out for that
'                    unit, so there is no thread to continue yet.
'    5. Shows it. You check it and press Send.
'
'  REQUIRES classic Outlook (the one with a File menu). The new Outlook
'  cannot run macros at all.
' =====================================================================

Option Explicit

' Where the browser puts downloads. Change only if yours is elsewhere.
Private Const DOWNLOAD_FOLDER As String = "Downloads"

' Must match the tool's inline image id — see src/lib/newsletter/eml.ts.
Private Const NEWSLETTER_CID As String = "newsletter"

' The MAPI property that makes an attachment show INSIDE the body rather
' than arrive as a file. Without it the picture appears as a paperclip.
Private Const PR_ATTACH_CONTENT_ID As String = _
    "http://schemas.microsoft.com/mapi/proptag/0x3712001F"

' Keeps the inline picture out of the paperclip list, so it appears once in
' the body rather than twice — once inline and once as a file.
Private Const PR_ATTACHMENT_HIDDEN As String = _
    "http://schemas.microsoft.com/mapi/proptag/0x7FFE000B"

Private Const olFolderSentMail As Long = 5


' ---------------------------------------------------------------------
'  THE ONE TO RUN. Put this on a toolbar button.
' ---------------------------------------------------------------------
Public Sub SendNewsletterInThread()
    Dim emlPath As String
    emlPath = NewestNewsletterFile()

    If Len(emlPath) = 0 Then
        MsgBox "No newsletter message found in your " & DOWNLOAD_FOLDER & " folder." & vbCrLf & vbCrLf & _
               "Press ""Open in Outlook, ready to send"" in the tool first, then run this again.", _
               vbInformation, "Nothing to send"
        Exit Sub
    End If

    Dim fresh As Outlook.MailItem
    On Error Resume Next
    Set fresh = Application.Session.OpenSharedItem(emlPath)
    On Error GoTo 0

    If fresh Is Nothing Then
        MsgBox "Outlook could not read this file:" & vbCrLf & emlPath, vbExclamation, "Cannot open"
        Exit Sub
    End If

    Dim previous As Outlook.MailItem
    Set previous = LastSentWithSubject(CleanSubject(fresh.Subject))

    If previous Is Nothing Then
        ' Nothing to reply to. The message is already complete, so just show it.
        fresh.Display
        Exit Sub
    End If

    Dim reply As Outlook.MailItem
    Set reply = previous.ReplyAll     ' Outlook sets the real threading headers here.

    ' The tool's addressing wins: a CC rule may have changed since last time.
    CopyRecipients fresh, reply

    ' Keep the subject stable so the conversation stays one conversation.
    reply.Subject = fresh.Subject

    ' This cycle's wording and picture above the quoted history.
    reply.HTMLBody = InnerHtml(fresh.HTMLBody) & reply.HTMLBody

    ' Saved before touching attachment properties: an unsaved item has no
    ' property accessor to write to.
    reply.Save
    CopyAttachments fresh, reply
    reply.Save

    reply.Display                      ' Your turn. Read it, then Send.

    ' Leave `fresh` alone — it is a temporary copy of the file, not a draft
    ' in the mailbox, and closing it would prompt about saving changes.
End Sub


' ---------------------------------------------------------------------
'  The newest .eml the tool produced.
' ---------------------------------------------------------------------
Private Function NewestNewsletterFile() As String
    Dim fso As Object, folder As Object, file As Object
    Dim newestPath As String, newestWhen As Date

    Set fso = CreateObject("Scripting.FileSystemObject")

    Dim path As String
    path = Environ$("USERPROFILE") & "\" & DOWNLOAD_FOLDER
    If Not fso.FolderExists(path) Then Exit Function

    Set folder = fso.GetFolder(path)
    For Each file In folder.Files
        If LCase$(fso.GetExtensionName(file.Name)) = "eml" Then
            If newestPath = "" Or file.DateLastModified > newestWhen Then
                newestPath = file.Path
                newestWhen = file.DateLastModified
            End If
        End If
    Next

    NewestNewsletterFile = newestPath
End Function


' ---------------------------------------------------------------------
'  The last thing sent with this subject, or Nothing.
' ---------------------------------------------------------------------
Private Function LastSentWithSubject(wanted As String) As Outlook.MailItem
    Dim items As Outlook.items
    Set items = Application.Session.GetDefaultFolder(olFolderSentMail).items

    ' Newest first, so the first match is the one to reply to.
    items.Sort "[SentOn]", True

    Dim candidate As Object, checked As Long
    For Each candidate In items
        checked = checked + 1
        ' A mailbox can hold years of mail; the newsletter went out recently.
        If checked > 3000 Then Exit For

        If TypeOf candidate Is Outlook.MailItem Then
            Dim mail As Outlook.MailItem
            Set mail = candidate
            If StrComp(CleanSubject(mail.Subject), wanted, vbTextCompare) = 0 Then
                Set LastSentWithSubject = mail
                Exit Function
            End If
        End If
    Next
End Function


' ---------------------------------------------------------------------
'  "RE: RE: Ancient Hill 56 Newsletter" -> "Ancient Hill 56 Newsletter"
' ---------------------------------------------------------------------
Private Function CleanSubject(subject As String) As String
    Dim result As String
    result = Trim$(subject)

    Dim changed As Boolean
    Do
        changed = False
        If Len(result) > 3 Then
            If StrComp(Left$(result, 3), "RE:", vbTextCompare) = 0 Then
                result = Trim$(Mid$(result, 4)): changed = True
            ElseIf StrComp(Left$(result, 3), "FW:", vbTextCompare) = 0 Then
                result = Trim$(Mid$(result, 4)): changed = True
            End If
        End If
        If Len(result) > 4 Then
            If StrComp(Left$(result, 4), "FWD:", vbTextCompare) = 0 Then
                result = Trim$(Mid$(result, 5)): changed = True
            End If
        End If
    Loop While changed

    CleanSubject = result
End Function


' ---------------------------------------------------------------------
'  Address the reply the way the tool addressed the file.
' ---------------------------------------------------------------------
Private Sub CopyRecipients(source As Outlook.MailItem, target As Outlook.MailItem)
    ' Cleared first, or Reply All's guesses are added to the tool's list.
    Do While target.Recipients.Count > 0
        target.Recipients.Remove 1
    Loop

    Dim recipient As Outlook.recipient, added As Outlook.recipient
    For Each recipient In source.Recipients
        ' An address can be blank if the header was malformed. Adding a blank
        ' one leaves an unresolved red name in the draft, so skip it.
        If Len(Trim$(recipient.Address)) > 0 Then
            Set added = target.Recipients.Add(recipient.Address)
            added.Type = recipient.Type      ' To stays To, Cc stays Cc.
        End If
    Next

    target.Recipients.ResolveAll
End Sub


' ---------------------------------------------------------------------
'  Move the picture and the PDF across, keeping the picture inline.
' ---------------------------------------------------------------------
Private Sub CopyAttachments(source As Outlook.MailItem, target As Outlook.MailItem)
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")

    Dim tempDir As String
    tempDir = fso.GetSpecialFolder(2) & "\" & fso.GetTempName
    fso.CreateFolder tempDir

    Dim attachment As Outlook.attachment
    Dim tempPath As String
    Dim copied As Outlook.attachment

    For Each attachment In source.Attachments
        tempPath = tempDir & "\" & attachment.FileName

        On Error Resume Next
        attachment.SaveAsFile tempPath
        If Err.Number <> 0 Then
            Err.Clear
            GoTo NextAttachment
        End If
        On Error GoTo 0

        Set copied = target.Attachments.Add(tempPath)

        ' The newsletter picture goes in the body; the PDF stays a file.
        If IsNewsletterPicture(attachment) Then
            On Error Resume Next
            copied.PropertyAccessor.SetProperty PR_ATTACH_CONTENT_ID, NEWSLETTER_CID
            copied.PropertyAccessor.SetProperty PR_ATTACHMENT_HIDDEN, True
            On Error GoTo 0
        End If

NextAttachment:
    Next

    ' The message keeps its own copy, so the temporary files can go.
    On Error Resume Next
    fso.DeleteFolder tempDir, True
    On Error GoTo 0
End Sub


Private Function IsNewsletterPicture(attachment As Outlook.attachment) As Boolean
    Dim name As String
    name = LCase$(attachment.FileName)
    IsNewsletterPicture = (Right$(name, 4) = ".jpg") Or (Right$(name, 5) = ".jpeg")
End Function


' ---------------------------------------------------------------------
'  Just the inside of a <body>, so two HTML documents do not get nested.
' ---------------------------------------------------------------------
Private Function InnerHtml(html As String) As String
    Dim startAt As Long, endAt As Long

    startAt = InStr(1, html, "<body", vbTextCompare)
    If startAt > 0 Then startAt = InStr(startAt, html, ">") + 1

    endAt = InStr(1, html, "</body>", vbTextCompare)

    If startAt > 0 And endAt > startAt Then
        InnerHtml = Mid$(html, startAt, endAt - startAt)
    Else
        ' Not shaped as expected — better to include everything than nothing.
        InnerHtml = html
    End If
End Function
