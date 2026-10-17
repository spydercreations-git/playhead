package mailer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"
	"strings"
	"time"
)

// Mailer handles sending transactional emails via Resend or local SMTP (Mailpit).
type Mailer struct {
	FromEmail    string
	FromName     string
	ResendAPIKey string
	SMTPHost     string
	SMTPPort     int
	FrontendURL  string
	httpClient   *http.Client
}

// Config holds mailer configuration.
type Config struct {
	FromEmail    string
	FromName     string
	ResendAPIKey string
	SMTPHost     string
	SMTPPort     int
	FrontendURL  string
}

// New creates a new Mailer instance.
func New(cfg Config) *Mailer {
	if cfg.FromEmail == "" {
		cfg.FromEmail = "no-reply@playhead.app"
	}
	if cfg.FromName == "" {
		cfg.FromName = "Playhead by Idyll Productions"
	}
	if cfg.SMTPHost == "" {
		cfg.SMTPHost = "localhost"
	}
	if cfg.SMTPPort == 0 {
		cfg.SMTPPort = 1025
	}
	if cfg.FrontendURL == "" {
		cfg.FrontendURL = "http://localhost:3000"
	}

	return &Mailer{
		FromEmail:    cfg.FromEmail,
		FromName:     cfg.FromName,
		ResendAPIKey: cfg.ResendAPIKey,
		SMTPHost:     cfg.SMTPHost,
		SMTPPort:     cfg.SMTPPort,
		FrontendURL:  cfg.FrontendURL,
		httpClient:   &http.Client{Timeout: 10 * time.Second},
	}
}

// send sends an email via Resend if an API key is provided, or via local SMTP.
func (m *Mailer) send(to, subject, htmlBody string) error {
	if m.ResendAPIKey != "" {
		return m.sendResend(to, subject, htmlBody)
	}
	return m.sendSMTP(to, subject, htmlBody)
}

func (m *Mailer) sendSMTP(to, subject, htmlBody string) error {
	addr := fmt.Sprintf("%s:%d", m.SMTPHost, m.SMTPPort)
	fromHeader := fmt.Sprintf("%s <%s>", m.FromName, m.FromEmail)

	msg := []byte(fmt.Sprintf("From: %s\r\n"+
		"To: %s\r\n"+
		"Subject: %s\r\n"+
		"MIME-Version: 1.0\r\n"+
		"Content-Type: text/html; charset=UTF-8\r\n"+
		"\r\n"+
		"%s\r\n", fromHeader, to, subject, htmlBody))

	// In local dev (Mailpit), auth is unauthenticated
	return smtp.SendMail(addr, nil, m.FromEmail, []string{to}, msg)
}

func (m *Mailer) sendResend(to, subject, htmlBody string) error {
	payload := map[string]interface{}{
		"from":    fmt.Sprintf("%s <%s>", m.FromName, m.FromEmail),
		"to":      []string{to},
		"subject": subject,
		"html":    htmlBody,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewReader(data))
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+m.ResendAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("resend returned status: %d", resp.StatusCode)
	}

	return nil
}

// SendEmailVerification sends a verification link.
func (m *Mailer) SendEmailVerification(toEmail, toName, token string) error {
	verifyURL := fmt.Sprintf("%s/verify-email?token=%s", strings.TrimRight(m.FrontendURL, "/"), token)
	subject := "Verify your Playhead email address"
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="background-color: #181818; color: #FFFFFF; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #212121; border-radius: 12px; border: 1px solid #424344; padding: 32px;">
    <h2 style="color: #FFFFFF; margin-top: 0;">Welcome to Playhead</h2>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">Hi %s,</p>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">Please verify your email address to complete your account setup and activate your workspace.</p>
    <div style="margin: 28px 0;">
      <a href="%s" style="background-color: #4876F3; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">Verify Email Address</a>
    </div>
    <p style="color: #747678; font-size: 12px;">This link will expire in 24 hours. If you did not sign up for Playhead, you can ignore this email.</p>
  </div>
</body>
</html>`, toName, verifyURL)

	return m.send(toEmail, subject, html)
}

// SendPasswordReset sends a password reset link.
func (m *Mailer) SendPasswordReset(toEmail, toName, token string) error {
	resetURL := fmt.Sprintf("%s/reset-password?token=%s", strings.TrimRight(m.FrontendURL, "/"), token)
	subject := "Reset your Playhead password"
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="background-color: #181818; color: #FFFFFF; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #212121; border-radius: 12px; border: 1px solid #424344; padding: 32px;">
    <h2 style="color: #FFFFFF; margin-top: 0;">Reset Your Password</h2>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">Hi %s,</p>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">We received a request to reset your password. Click the button below to choose a new password.</p>
    <div style="margin: 28px 0;">
      <a href="%s" style="background-color: #4876F3; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">Reset Password</a>
    </div>
    <p style="color: #747678; font-size: 12px;">This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
  </div>
</body>
</html>`, toName, resetURL)

	return m.send(toEmail, subject, html)
}

// SendTeamInvite sends an invitation link to a new team member.
func (m *Mailer) SendTeamInvite(toEmail, companyName, inviterName, token string) error {
	inviteURL := fmt.Sprintf("%s/invite/%s", strings.TrimRight(m.FrontendURL, "/"), token)
	subject := fmt.Sprintf("You're invited to join %s on Playhead", companyName)
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="background-color: #181818; color: #FFFFFF; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #212121; border-radius: 12px; border: 1px solid #424344; padding: 32px;">
    <h2 style="color: #FFFFFF; margin-top: 0;">Join %s on Playhead</h2>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">%s invited you to collaborate on video projects, cuts, and reviews in <strong>%s</strong>.</p>
    <div style="margin: 28px 0;">
      <a href="%s" style="background-color: #4876F3; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">Accept Invitation</a>
    </div>
    <p style="color: #747678; font-size: 12px;">This invitation will expire in 7 days. Note: This invite can only be accepted by an account with email %s.</p>
  </div>
</body>
</html>`, companyName, inviterName, companyName, inviteURL, toEmail)

	return m.send(toEmail, subject, html)
}

// SendLoginCode sends a 6-digit email sign-in code.
func (m *Mailer) SendLoginCode(toEmail, code string) error {
	subject := fmt.Sprintf("%s is your Playhead verification code", code)
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="background-color: #181818; color: #FFFFFF; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #212121; border-radius: 12px; border: 1px solid #424344; padding: 32px; text-align: center;">
    <h2 style="color: #FFFFFF; margin-top: 0;">Your Playhead Verification Code</h2>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">Enter this 6-digit code on the sign-in screen to access your workspace:</p>
    <div style="margin: 32px 0;">
      <span style="background-color: #2B2C2D; color: #FFFFFF; font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 12px 24px; border-radius: 8px; border: 1px solid #4876F3; display: inline-block;">%s</span>
    </div>
    <p style="color: #747678; font-size: 12px;">This code is valid for 10 minutes and can only be used once. If you did not request this code, you can safely ignore this email.</p>
  </div>
</body>
</html>`, code)

	return m.send(toEmail, subject, html)
}

// SendStorageAlertEmail notifies admins when company storage crosses a threshold.
func (m *Mailer) SendStorageAlertEmail(toEmail, toName, companyName string, usedGB, alertGB int) error {
	subject := fmt.Sprintf("Storage Alert: %s has used %d GB of storage", companyName, usedGB)
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="background-color: #181818; color: #FFFFFF; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #212121; border-radius: 12px; border: 1px solid #424344; padding: 32px;">
    <h2 style="color: #FFFFFF; margin-top: 0;">Storage Threshold Alert</h2>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">Hi %s,</p>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">Your workspace <strong>%s</strong> has passed the storage alert threshold of <strong>%d GB</strong>. Current usage is <strong>%d GB</strong>.</p>
    <div style="margin: 28px 0;">
      <a href="%s/settings/storage" style="background-color: #4876F3; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">Review Storage & Costs</a>
    </div>
    <p style="color: #747678; font-size: 12px;">You will receive another reminder if usage increases by another 500 GB.</p>
  </div>
</body>
</html>`, toName, companyName, alertGB, usedGB, strings.TrimRight(m.FrontendURL, "/"))

	return m.send(toEmail, subject, html)
}

// SendZipReadyEmail notifies a user that their background zip download is prepared.
func (m *Mailer) SendZipReadyEmail(toEmail, toName, downloadURL string) error {
	subject := "Your Playhead download archive is ready"
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="background-color: #181818; color: #FFFFFF; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #212121; border-radius: 12px; border: 1px solid #424344; padding: 32px;">
    <h2 style="color: #FFFFFF; margin-top: 0;">Your Download is Ready</h2>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">Hi %s,</p>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">The zip archive you requested has finished processing and is ready for download.</p>
    <div style="margin: 28px 0;">
      <a href="%s" style="background-color: #4876F3; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">Download Zip Archive</a>
    </div>
    <p style="color: #747678; font-size: 12px;">This link is valid for 24 hours.</p>
  </div>
</body>
</html>`, toName, downloadURL)

	return m.send(toEmail, subject, html)
}

// SendProjectAccessEmail notifies a user that they were added to a project.
func (m *Mailer) SendProjectAccessEmail(toEmail, toName, projectName, projectURL, granterName string) error {
	subject := fmt.Sprintf("You were added to project '%s' on Playhead", projectName)
	if toName == "" {
		toName = "there"
	}
	settingsURL := fmt.Sprintf("%s/settings/notifications", strings.TrimRight(m.FrontendURL, "/"))
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="background-color: #181818; color: #FFFFFF; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #212121; border-radius: 12px; border: 1px solid #424344; padding: 32px;">
    <div style="margin-bottom: 24px;">
      <span style="font-size: 20px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px;">playhead</span>
    </div>
    <h2 style="color: #FFFFFF; margin-top: 0; font-size: 18px;">Project Access Granted</h2>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">Hi %s,</p>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;"><strong>%s</strong> added you to the project <strong>%s</strong>.</p>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">If you don't have a password yet, you can sign in directly using a 6-digit email verification code with this email address.</p>
    <div style="margin: 28px 0;">
      <a href="%s" style="background-color: #4876F3; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">Open Project</a>
    </div>
    <hr style="border: none; border-top: 1px solid #333333; margin: 24px 0;" />
    <p style="color: #747678; font-size: 12px; margin: 0;">
      Manage your email preferences in <a href="%s" style="color: #4876F3; text-decoration: none;">Notification settings</a>.
    </p>
  </div>
</body>
</html>`, toName, granterName, projectName, projectURL, settingsURL)

	return m.send(toEmail, subject, html)
}

// SendItemSharedEmail notifies a user that a folder or file was shared with them.
func (m *Mailer) SendItemSharedEmail(toEmail, toName, itemName, itemKind, itemURL, granterName string) error {
	subject := fmt.Sprintf("%s shared a %s with you: '%s'", granterName, itemKind, itemName)
	if toName == "" {
		toName = "there"
	}
	settingsURL := fmt.Sprintf("%s/settings/notifications", strings.TrimRight(m.FrontendURL, "/"))
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="background-color: #181818; color: #FFFFFF; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #212121; border-radius: 12px; border: 1px solid #424344; padding: 32px;">
    <div style="margin-bottom: 24px;">
      <span style="font-size: 20px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px;">playhead</span>
    </div>
    <h2 style="color: #FFFFFF; margin-top: 0; font-size: 18px;">Item Shared with You</h2>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">Hi %s,</p>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;"><strong>%s</strong> shared the %s <strong>%s</strong> with you on Playhead.</p>
    <div style="margin: 28px 0;">
      <a href="%s" style="background-color: #4876F3; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">View Shared %s</a>
    </div>
    <hr style="border: none; border-top: 1px solid #333333; margin: 24px 0;" />
    <p style="color: #747678; font-size: 12px; margin: 0;">
      Manage your email preferences in <a href="%s" style="color: #4876F3; text-decoration: none;">Notification settings</a>.
    </p>
  </div>
</body>
</html>`, toName, granterName, itemKind, itemName, itemURL, strings.Title(itemKind), settingsURL)

	return m.send(toEmail, subject, html)
}

// NotificationComment represents a single comment in an aggregated notification email
type NotificationComment struct {
	AuthorName  string
	TimecodeStr string
	Body        string
}

// SendGroupedCommentsNotificationEmail sends an aggregated digest of comments on an item
func (m *Mailer) SendGroupedCommentsNotificationEmail(toEmail, toName, itemName, itemURL string, comments []NotificationComment) error {
	if len(comments) == 0 {
		return nil
	}
	if toName == "" {
		toName = "there"
	}

	var subject string
	if len(comments) == 1 {
		subject = fmt.Sprintf("New comment on '%s'", itemName)
	} else {
		subject = fmt.Sprintf("%d new comments on '%s'", len(comments), itemName)
	}

	var commentsListHTML strings.Builder
	for _, c := range comments {
		tcBadge := ""
		if c.TimecodeStr != "" {
			tcBadge = fmt.Sprintf(`<span style="background-color: #2D2D2D; color: #FFA133; font-family: monospace; font-size: 11px; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">%s</span>`, c.TimecodeStr)
		}
		commentsListHTML.WriteString(fmt.Sprintf(`
      <div style="background-color: #181818; border-left: 3px solid #4876F3; padding: 12px 16px; margin: 12px 0; border-radius: 4px; color: #E0E0E0; font-size: 14px; line-height: 1.5;">
        <div style="font-weight: 600; color: #FFFFFF; font-size: 13px; margin-bottom: 4px;">%s%s</div>
        <div>%s</div>
      </div>
    `, c.AuthorName, tcBadge, c.Body))
	}

	settingsURL := fmt.Sprintf("%s/settings/notifications", strings.TrimRight(m.FrontendURL, "/"))
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="background-color: #181818; color: #FFFFFF; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #212121; border-radius: 12px; border: 1px solid #424344; padding: 32px;">
    <div style="margin-bottom: 24px;">
      <span style="font-size: 20px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px;">playhead</span>
    </div>
    <h2 style="color: #FFFFFF; margin-top: 0; font-size: 18px;">%s</h2>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">Hi %s,</p>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">There are new comments on <strong>%s</strong>:</p>
    %s
    <div style="margin: 28px 0;">
      <a href="%s" style="background-color: #4876F3; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">View in Playhead</a>
    </div>
    <hr style="border: none; border-top: 1px solid #333333; margin: 24px 0;" />
    <p style="color: #747678; font-size: 12px; margin: 0;">
      Manage your email preferences in <a href="%s" style="color: #4876F3; text-decoration: none;">Notification settings</a>.
    </p>
  </div>
</body>
</html>`, subject, toName, itemName, commentsListHTML.String(), itemURL, settingsURL)

	return m.send(toEmail, subject, html)
}

// SendCommentNotificationEmail sends comment notification or digest
func (m *Mailer) SendCommentNotificationEmail(toEmail, toName, commenterName, itemName, itemURL, commentBody string) error {
	return m.SendGroupedCommentsNotificationEmail(toEmail, toName, itemName, itemURL, []NotificationComment{
		{AuthorName: commenterName, Body: commentBody},
	})
}

// SendReviewNotificationEmail sends approval or change request review notification
func (m *Mailer) SendReviewNotificationEmail(toEmail, toName, reviewerName, itemName, itemURL, decision, note string) error {
	statusTitle := "Approved"
	accentColor := "#30A46C"
	if decision == "changes_requested" {
		statusTitle = "Changes Requested"
		accentColor = "#E54D2E"
	}
	subject := fmt.Sprintf("%s: '%s' by %s", statusTitle, itemName, reviewerName)
	if toName == "" {
		toName = "there"
	}
	settingsURL := fmt.Sprintf("%s/settings/notifications", strings.TrimRight(m.FrontendURL, "/"))
	noteSection := ""
	if strings.TrimSpace(note) != "" {
		noteSection = fmt.Sprintf(`<div style="background-color: #181818; border-left: 3px solid %s; padding: 12px 16px; margin: 20px 0; border-radius: 4px; color: #E0E0E0; font-size: 14px; line-height: 1.5;">%s</div>`, accentColor, note)
	}
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="background-color: #181818; color: #FFFFFF; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #212121; border-radius: 12px; border: 1px solid #424344; padding: 32px;">
    <div style="margin-bottom: 24px;">
      <span style="font-size: 20px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px;">playhead</span>
    </div>
    <h2 style="color: #FFFFFF; margin-top: 0; font-size: 18px;">Review Decision: <span style="color: %s;">%s</span></h2>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;">Hi %s,</p>
    <p style="color: #9A9DA0; font-size: 14px; line-height: 1.5;"><strong>%s</strong> marked <strong>%s</strong> as <strong>%s</strong>.</p>
    %s
    <div style="margin: 28px 0;">
      <a href="%s" style="background-color: #4876F3; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">View in Playhead</a>
    </div>
    <hr style="border: none; border-top: 1px solid #333333; margin: 24px 0;" />
    <p style="color: #747678; font-size: 12px; margin: 0;">
      Manage your email preferences in <a href="%s" style="color: #4876F3; text-decoration: none;">Notification settings</a>.
    </p>
  </div>
</body>
</html>`, accentColor, statusTitle, toName, reviewerName, itemName, statusTitle, noteSection, itemURL, settingsURL)

	return m.send(toEmail, subject, html)
}

// SendClientPersonInviteEmail sends an onboarding invite email to a client person with their temporary password and Google sign-in options.
func (m *Mailer) SendClientPersonInviteEmail(toEmail, toName, clientName, companyName, tempPassword, loginURL string) error {
	subject := fmt.Sprintf("You've been invited to %s on Playhead", clientName)
	if toName == "" {
		toName = strings.Split(toEmail, "@")[0]
	}
	if loginURL == "" {
		loginURL = fmt.Sprintf("%s/login", strings.TrimRight(m.FrontendURL, "/"))
	}

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>%s</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0A0A0B; color: #FFFFFF; padding: 40px 20px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #111113; border: 1px solid #232327; border-radius: 12px; padding: 32px;">
    <div style="margin-bottom: 24px;">
      <span style="font-size: 20px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px;">playhead</span>
    </div>
    <h1 style="font-size: 18px; font-weight: 600; color: #FFFFFF; margin: 0 0 12px 0;">Welcome, %s</h1>
    <p style="font-size: 14px; line-height: 22px; color: #A1A1AA; margin: 0 0 20px 0;">
      <strong>%s</strong> has added you to <strong>%s</strong> on Playhead to review creative projects and files.
    </p>
    <div style="background-color: #1A1A1E; border: 1px solid #232327; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
      <p style="font-size: 12px; color: #71717A; margin: 0 0 6px 0;">Your temporary login password:</p>
      <p style="font-size: 16px; font-family: monospace; font-weight: 700; color: #FFFFFF; margin: 0 0 8px 0; letter-spacing: 1px;">%s</p>
      <p style="font-size: 12px; color: #A1A1AA; margin: 0;">You can also sign in instantly using <strong>Sign in with Google</strong> with this email address.</p>
    </div>
    <div style="text-align: center; margin: 0 0 24px 0;">
      <a href="%s" style="display: inline-block; background-color: #3B67E0; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px;">Sign in to Playhead</a>
    </div>
    <p style="font-size: 12px; line-height: 18px; color: #71717A; margin: 0;">
      This temporary password expires in 7 days. Once you sign in, you can set your permanent password and profile details.
    </p>
  </div>
</body>
</html>`, subject, toName, companyName, clientName, tempPassword, loginURL)

	return m.send(toEmail, subject, htmlBody)
}

