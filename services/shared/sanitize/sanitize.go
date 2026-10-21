package sanitize

import (
	"regexp"
	"strings"

	"github.com/microcosm-cc/bluemonday"
)

var richTextPolicy *bluemonday.Policy

func init() {
	p := bluemonday.NewPolicy()

	// 1. Approved text formatting and semantic block elements
	p.AllowElements(
		"p", "h1", "h2", "h3",
		"strong", "b", "em", "i", "u", "s", "strike", "del",
		"code", "pre", "blockquote", "hr",
		"ul", "ol", "li", "br",
		"mark",
		"span",
	)

	// 2. Allow links with strict HTTP/HTTPS schemes only
	p.AllowElements("a")
	p.AllowAttrs("href").OnElements("a")
	p.AllowURLSchemes("http", "https")
	p.RequireParseableURLs(true)
	p.AddTargetBlankToFullyQualifiedLinks(true)
	p.RequireNoReferrerOnFullyQualifiedLinks(true)
	p.RequireNoReferrerOnLinks(true)

	// Also explicitly allow target and rel if already provided (bluemonday ensures they are safe)
	p.AllowAttrs("target", "rel").OnElements("a")

	// 3. Allow data-* attributes (used by TipTap link pills, mentions, video cards, etc.)
	p.AllowDataAttributes()

	// 4. Allow safe class and title attributes on elements
	safeIdentRegex := regexp.MustCompile(`^[a-zA-Z0-9_\-\s]+$`)
	p.AllowAttrs("class", "title").Matching(safeIdentRegex).Globally()

	richTextPolicy = p
}

// RichText cleans and sanitizes HTML content according to the strict allowlist policy.
// It allows only approved tags and attributes, blocks scripts/iframes/event handlers/styles/javascript URIs,
// and ensures links are http/https only with rel="noopener noreferrer" and target="_blank".
func RichText(input string) string {
	if strings.TrimSpace(input) == "" {
		return ""
	}

	sanitized := richTextPolicy.Sanitize(input)

	// Ensure any anchor tag without target="_blank" or rel="noopener noreferrer" is upgraded
	return enforceLinkRelAndTarget(sanitized)
}

var anchorRegex = regexp.MustCompile(`(?i)<a\s+([^>]+)>`)
var hrefRegex = regexp.MustCompile(`(?i)\bhref\s*=\s*("[^"]*"|'[^']*')`)
var relRegex = regexp.MustCompile(`(?i)\brel\s*=\s*("[^"]*"|'[^']*')`)
var targetRegex = regexp.MustCompile(`(?i)\btarget\s*=\s*("[^"]*"|'[^']*')`)

func enforceLinkRelAndTarget(html string) string {
	if !strings.Contains(strings.ToLower(html), "<a") {
		return html
	}

	return anchorRegex.ReplaceAllStringFunc(html, func(tag string) string {
		// Only touch anchor tags with href
		if !hrefRegex.MatchString(tag) {
			return tag
		}

		// Ensure target="_blank"
		if targetRegex.MatchString(tag) {
			tag = targetRegex.ReplaceAllString(tag, `target="_blank"`)
		} else {
			tag = strings.TrimSuffix(tag, ">") + ` target="_blank">`
		}

		// Ensure rel="noopener noreferrer"
		if relRegex.MatchString(tag) {
			tag = relRegex.ReplaceAllString(tag, `rel="noopener noreferrer"`)
		} else {
			tag = strings.TrimSuffix(tag, ">") + ` rel="noopener noreferrer">`
		}

		return tag
	})
}
