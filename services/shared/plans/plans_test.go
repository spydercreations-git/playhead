package plans

import (
	"testing"
)

func TestPlanStorageLimits(t *testing.T) {
	// Trial is fixed 25 GB regardless of seats, blocks add 1 TB each
	trialLimit := CalculateStorageLimit(PlanTrial, 1, 0)
	expectedTrial := int64(25) * GB
	if trialLimit != expectedTrial {
		t.Fatalf("expected trial storage limit %d, got %d", expectedTrial, trialLimit)
	}

	trialWithBlocks := CalculateStorageLimit(PlanTrial, 2, 2)
	expectedWithBlocks := expectedTrial + 2*TB
	if trialWithBlocks != expectedWithBlocks {
		t.Fatalf("expected trial with blocks %d, got %d", expectedWithBlocks, trialWithBlocks)
	}

	// Pro is 250 GB per seat pooled
	proLimit := CalculateStorageLimit(PlanPro, 3, 1)
	expectedPro := (int64(3) * 250 * GB) + 1*TB
	if proLimit != expectedPro {
		t.Fatalf("expected pro storage limit %d, got %d", expectedPro, proLimit)
	}

	// Team minimum 3 seats enforced even if seats passed is lower
	teamLimitMin := CalculateStorageLimit(PlanTeam, 1, 0)
	expectedTeamMin := int64(3) * 500 * GB
	if teamLimitMin != expectedTeamMin {
		t.Fatalf("expected team min storage limit %d, got %d", expectedTeamMin, teamLimitMin)
	}

	// Company minimum 5 seats (1 TB per seat)
	companyLimit := CalculateStorageLimit(PlanCompany, 5, 0)
	expectedCompany := int64(5) * 1 * TB
	if companyLimit != expectedCompany {
		t.Fatalf("expected company storage limit %d, got %d", expectedCompany, companyLimit)
	}
}

func TestPlanFeatureGates(t *testing.T) {
	// Pro does not have board automations or version compare
	if Has(PlanPro, FeatureBoardAutomations) {
		t.Errorf("Pro plan should not have Board Automations")
	}
	if Has(PlanPro, FeatureVersionCompare) {
		t.Errorf("Pro plan should not have Version Compare")
	}

	// Team has board automations and version compare, but not branded share pages
	if !Has(PlanTeam, FeatureBoardAutomations) {
		t.Errorf("Team plan should have Board Automations")
	}
	if !Has(PlanTeam, FeatureVersionCompare) {
		t.Errorf("Team plan should have Version Compare")
	}
	if Has(PlanTeam, FeatureBrandedSharePages) {
		t.Errorf("Team plan should not have Branded Share Pages")
	}

	// Company plan has branded share pages and verified badge, and no watermark
	if !Has(PlanCompany, FeatureBrandedSharePages) {
		t.Errorf("Company plan should have Branded Share Pages")
	}
	if !Has(PlanCompany, FeatureVerifiedBadge) {
		t.Errorf("Company plan should have Verified Badge")
	}
	if Has(PlanCompany, FeatureMadeWithPlayhead) {
		t.Errorf("Company plan should not have Made With Playhead watermark")
	}
}

func TestMaxFileSize(t *testing.T) {
	if MaxFileSize(PlanTrial) != 5*GB {
		t.Errorf("expected trial max file size 5GB")
	}
	if MaxFileSize(PlanPro) != 50*GB {
		t.Errorf("expected pro max file size 50GB")
	}
	if MaxFileSize(PlanTeam) != 100*GB {
		t.Errorf("expected team max file size 100GB")
	}
	if MaxFileSize(PlanCompany) != 250*GB {
		t.Errorf("expected company max file size 250GB")
	}
}
