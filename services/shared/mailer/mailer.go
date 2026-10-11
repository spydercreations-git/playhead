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
		cfg.FromName = "Playhead"
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
<body style="background-color: #181818; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px;">
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
<body style="background-color: #181818; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px;">
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
<body style="background-color: #181818; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px;">
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
