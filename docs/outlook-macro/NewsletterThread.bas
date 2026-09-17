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
'    3. Searches EVERY account's Sent Items for the last message with
'       the same subject.
'    4. Found     -> Reply All on it, so Outlook sets the hidden headers
'                    that make it a real reply, then puts this cycle's
'                    wording and files at the top.
'       Not found -> says WHY, and offers to open it as a new message.
'    5. Shows it. You check it and press Send.
'
'  IF IT OPENS A NEW MESSAGE INSTEAD OF A REPLY
'  Run NewsletterThreadCheck (below) — it reports exactly what it looked
'  for and what it found, in one box. The usual cause is a subject line
'  that is not identical to last cycle's: Outlook has no other way to
'  know two emails belong together. Check the tool's Mail settings for a
'  subject containing the edition date or a person's name.
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

    Dim wanted As String
    wanted = CleanSubject(fresh.Subject)

    Dim searched As Long, matched As Long
    Dim previous As Outlook.MailItem
    Set previous = LastSentWithSubject(wanted, searched, matched)

    If previous Is Nothing Then
        ' Say WHY rather than quietly opening a new message. Silently falling
        ' back is what made a broken thread impossible to diagnose: the macro
        ' looked like it had done nothing at all.
        Dim answer As VbMsgBoxResult
        answer = MsgBox( _
            "This will open as a NEW email, not a reply." & vbCrLf & vbCrLf & _
            "Nothing in your Sent Items has the subject:" & vbCrLf & _
            "    " & wanted & vbCrLf & vbCrLf & _
            "Searched " & searched & " Sent Items folder(s)." & vbCrLf & vbCrLf & _
            "If this unit HAS been sent before, last cycle's subject was different — " & _
            "Outlook has no other way to know two emails belong together. Check the " & _
            "tool's Mail settings for a subject line containing the edition date or a " & _
            "person's name, and use one that is the same every cycle." & vbCrLf & vbCrLf & _
            "Open it as a new email anyway?", _
            vbQuestion + vbYesNo, "No previous newsletter found")

        If answer = vbYes Then fresh.Display
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
'  THE ONE FOR WHEN DOUBLE-CLICKING DID NOT CONTINUE THE THREAD.
'
'  You find the unit's conversation yourself — search for it, click any
'  message in it — and this puts THIS cycle's newsletter into that
'  thread: wording, picture in the body, PDF attached, addressed the way
'  the tool addressed it. One button instead of reply-all, paste the
'  picture, drag the PDF.
'
'  It never sends. It opens the draft and you press Send.
'
'  WHY THIS EXISTS. The tool writes the reply headers into the message
'  file, so for a unit it has an anchor for, double-clicking the file is
'  already a genuine reply. For a unit it has no anchor for — one not
'  sent since the tool started recording them — the file opens as a new
'  email and there is nothing to do about it from the tool's side.
'
'  Using this once fixes that unit for good: the reply you send lands in
'  the thread with PMOTeam copied, so the tool can pick that message up
'  as the unit's anchor and the NEXT cycle threads on double-click.
' ---------------------------------------------------------------------
Public Sub ReplyIntoSelectedThread()
    Dim chosen As Object
    Set chosen = SelectedMailItem()
    If chosen Is Nothing Then Exit Sub

    Dim previous As Outlook.MailItem
    Set previous = chosen

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

    ' ---------------------------------------------------------------
    '  The one thing that must not go wrong.
    '
    '  This replies into whatever you had selected. Select the wrong
    '  conversation and a paying client receives another client's
    '  history — which is worse than no threading at all, and cannot be
    '  taken back. So both subjects are shown, and when they do not
    '  match the warning says so in as many words.
    ' ---------------------------------------------------------------
    Dim sameUnit As Boolean
    sameUnit = (StrComp(CleanSubject(previous.Subject), CleanSubject(fresh.Subject), vbTextCompare) = 0)

    Dim warning As String
    If sameUnit Then
        warning = "These are the same unit."
    Else
        warning = "*** THESE ARE NOT THE SAME UNIT ***" & vbCrLf & vbCrLf & _
                  "If that is not deliberate, press No. Sending this would show " & _
                  "one client another client's conversation."
    End If

    If MsgBox( _
        "Add this cycle's newsletter to the conversation you selected?" & vbCrLf & vbCrLf & _
        "The newsletter to send:" & vbCrLf & "    " & fresh.Subject & vbCrLf & vbCrLf & _
        "The conversation you selected:" & vbCrLf & "    " & previous.Subject & vbCrLf & _
        "    sent " & Format$(previous.SentOn, "d mmm yyyy") & vbCrLf & vbCrLf & _
        warning, _
        vbQuestion + vbYesNo + IIf(sameUnit, vbDefaultButton1, vbDefaultButton2), _
        "Continue this thread?") <> vbYes Then Exit Sub

    Dim reply As Outlook.MailItem
    Set reply = previous.ReplyAll     ' Outlook sets the real threading headers here.

    ' The tool's addressing wins: a CC rule may have changed since last time,
    ' and Reply All would otherwise carry whoever happened to be on that message.
    CopyRecipients fresh, reply
    reply.Subject = fresh.Subject

    ' This cycle's wording and picture above the quoted history.
    reply.HTMLBody = InnerHtml(fresh.HTMLBody) & reply.HTMLBody

    ' Saved before touching attachment properties: an unsaved item has no
    ' property accessor to write to.
    reply.Save
    CopyAttachments fresh, reply
    reply.Save

    reply.Display                     ' Your turn. Read it, then Send.
End Sub


' ---------------------------------------------------------------------
'  The message you have selected, or Nothing with the reason said out
'  loud. Handles both places a message can be selected from: the list in
'  the main window, and a message you have opened in its own window.
' ---------------------------------------------------------------------
Private Function SelectedMailItem() As Outlook.MailItem
    Dim candidate As Object

    ' An open message window wins — if you are reading the thread, that is
    ' the one you mean.
    On Error Resume Next
    Set candidate = Application.ActiveInspector.CurrentItem
    On Error GoTo 0

    If candidate Is Nothing Then
        Dim explorer As Outlook.explorer
        On Error Resume Next
        Set explorer = Application.ActiveExplorer
        On Error GoTo 0

        If explorer Is Nothing Then
            MsgBox "Open Outlook's main window first.", vbInformation, "Nothing selected"
            Exit Function
        End If

        If explorer.Selection.Count = 0 Then
            MsgBox "Select a message from the unit's conversation first." & vbCrLf & vbCrLf & _
                   "Search for the unit, click any message in that thread, then run this again.", _
                   vbInformation, "Nothing selected"
            Exit Function
        End If

        If explorer.Selection.Count > 1 Then
            MsgBox "Select ONE message, not " & explorer.Selection.Count & "." & vbCrLf & vbCrLf & _
                   "Any message in the right conversation will do.", _
                   vbInformation, "Too many selected"
            Exit Function
        End If

        Set candidate = explorer.Selection.Item(1)
    End If

    If Not TypeOf candidate Is Outlook.MailItem Then
        ' A meeting request, a task or a contact cannot be replied to as mail.
        MsgBox "That is not an email, so there is no conversation to continue." & vbCrLf & _
               "Select a message from the unit's newsletter thread.", _
               vbInformation, "Not an email"
        Exit Function
    End If

    ' The likeliest wrong answer, and it would not announce itself.
    '
    ' The normal way into this macro is: double-click the file, see that it did
    ' NOT continue the thread, go and find the thread. If the draft from that
    ' double-click is still open, it is the active window — so Outlook hands us
    ' the unsent newsletter itself rather than the conversation. Replying to an
    ' unsent draft produces a reply to nothing: no thread, and no SentOn to read.
    Dim asMail As Outlook.MailItem
    Set asMail = candidate
    If Not asMail.Sent Then
        MsgBox "That is an unsent draft, not a message from the conversation." & vbCrLf & vbCrLf & _
               "It is probably the newsletter you just opened. Close it without sending, " & _
               "then find the unit's conversation and click a message in it.", _
               vbInformation, "That is the draft, not the thread"
        Exit Function
    End If

    Set SelectedMailItem = asMail
End Function


' ---------------------------------------------------------------------
'  RUN THIS WHEN IT OPENS A NEW MESSAGE INSTEAD OF A REPLY.
'
'  Reports what it looked for and what it found, and — when it finds
'  nothing — lists the newsletter-ish subjects it CAN see, which is
'  usually enough to spot the subject line that changed.
' ---------------------------------------------------------------------
Public Sub NewsletterThreadCheck()
    Dim emlPath As String
    emlPath = NewestNewsletterFile()

    If Len(emlPath) = 0 Then
        MsgBox "No newsletter message found in your " & DOWNLOAD_FOLDER & " folder." & vbCrLf & _
               "Press ""Open in Outlook, ready to send"" in the tool first.", _
               vbInformation, "Nothing to check"
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

    Dim wanted As String
    wanted = CleanSubject(fresh.Subject)

    Dim searched As Long, matched As Long
    Dim previous As Outlook.MailItem
    Set previous = LastSentWithSubject(wanted, searched, matched)

    Dim report As String
    report = "File:" & vbCrLf & "    " & emlPath & vbCrLf & vbCrLf & _
             "Subject it will look for:" & vbCrLf & "    " & wanted & vbCrLf & vbCrLf & _
             "Sent Items folders searched: " & searched & vbCrLf & _
             "Messages with that subject:  " & matched & vbCrLf & vbCrLf

    If previous Is Nothing Then
        report = report & "RESULT: it will open a NEW email." & vbCrLf & vbCrLf & _
                 "Recent newsletter-like subjects in your Sent Items:" & vbCrLf & _
                 RecentNewsletterSubjects() & vbCrLf & _
                 "If one of those is this unit, its subject differs from the one above." & _
                 " Make the tool's subject line identical every cycle."
    Else
        report = report & "RESULT: it will reply to the message sent on " & _
                 Format$(previous.SentOn, "d mmm yyyy hh:nn") & "." & vbCrLf & _
                 "Threading is working."
    End If

    MsgBox report, vbInformation, "Newsletter thread check"
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
'
'  Two things this deliberately does NOT do any more, both of which
'  could silently find nothing in a real mailbox:
'
'   * It no longer walks the first 3,000 items of one folder. That
'     relied on Items.Sort having reordered the collection; where the
'     sort does not take effect the walk examines the OLDEST 3,000
'     instead, and a mailbox with years of mail never reaches last
'     month's newsletter. Restrict asks the store to do the matching,
'     which is indexed, has no cap and does not care about order.
'
'   * It no longer looks only in the DEFAULT account's Sent Items. A
'     second mailbox, or a shared one, files sent mail in its own
'     folder, and the newsletters were invisible from the default.
' ---------------------------------------------------------------------
Private Function LastSentWithSubject(wanted As String, _
                                     ByRef foldersSearched As Long, _
                                     ByRef matchesFound As Long) As Outlook.MailItem
    Dim store As Outlook.store
    Dim sentFolder As Outlook.folder
    Dim found As Outlook.items
    Dim candidate As Object
    Dim mail As Outlook.MailItem
    Dim best As Outlook.MailItem
    Dim bestWhen As Date

    foldersSearched = 0
    matchesFound = 0

    For Each store In Application.Session.Stores
        Set sentFolder = Nothing
        ' A store can be an archive, a public folder or offline — asking any of
        ' those for Sent Items raises rather than returning Nothing.
        On Error Resume Next
        Set sentFolder = store.GetDefaultFolder(olFolderSentMail)
        On Error GoTo 0

        If Not sentFolder Is Nothing Then
            foldersSearched = foldersSearched + 1

            Set found = Nothing
            On Error Resume Next
            Set found = sentFolder.items.Restrict(SubjectFilter(wanted))
            On Error GoTo 0

            If Not found Is Nothing Then
                For Each candidate In found
                    If TypeOf candidate Is Outlook.MailItem Then
                        Set mail = candidate
                        ' Restrict matched loosely so "RE: …" is caught too;
                        ' this is the exact comparison.
                        If StrComp(CleanSubject(mail.Subject), wanted, vbTextCompare) = 0 Then
                            matchesFound = matchesFound + 1
                            If best Is Nothing Then
                                Set best = mail
                                bestWhen = mail.SentOn
                            ElseIf mail.SentOn > bestWhen Then
                                Set best = mail
                                bestWhen = mail.SentOn
                            End If
                        End If
                    End If
                Next
            End If
        End If
    Next

    Set LastSentWithSubject = best
End Function


' ---------------------------------------------------------------------
'  A DASL filter matching any subject CONTAINING the wanted text, so a
'  stored "RE: Cyan 11 Newsletter" is found by "Cyan 11 Newsletter".
' ---------------------------------------------------------------------
Private Function SubjectFilter(wanted As String) As String
    Dim safe As String
    safe = Replace(wanted, "'", "''")           ' a quote would end the literal
    SubjectFilter = "@SQL=" & Chr$(34) & "urn:schemas:httpmail:subject" & Chr$(34) & _
                    " like '%" & safe & "%'"
End Function


' ---------------------------------------------------------------------
'  Recent subjects containing "newsletter", newest first — the list that
'  usually shows which subject line changed.
' ---------------------------------------------------------------------
Private Function RecentNewsletterSubjects() As String
    Dim store As Outlook.store
    Dim sentFolder As Outlook.folder
    Dim found As Outlook.items
    Dim candidate As Object
    Dim seen As Object
    Dim out As String
    Dim shown As Long

    Set seen = CreateObject("Scripting.Dictionary")

    For Each store In Application.Session.Stores
        Set sentFolder = Nothing
        On Error Resume Next
        Set sentFolder = store.GetDefaultFolder(olFolderSentMail)
        On Error GoTo 0

        If Not sentFolder Is Nothing Then
            Set found = Nothing
            On Error Resume Next
            Set found = sentFolder.items.Restrict(SubjectFilter("Newsletter"))
            On Error GoTo 0

            If Not found Is Nothing Then
                For Each candidate In found
                    If shown >= 15 Then Exit For
                    If TypeOf candidate Is Outlook.MailItem Then
                        Dim subject As String
                        subject = CleanSubject(candidate.Subject)
                        If Not seen.Exists(LCase$(subject)) Then
                            seen.Add LCase$(subject), True
                            out = out & "    " & subject & vbCrLf
                            shown = shown + 1
                        End If
                    End If
                Next
            End If
        End If
    Next

    If Len(out) = 0 Then out = "    (none found)" & vbCrLf
    RecentNewsletterSubjects = out
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
