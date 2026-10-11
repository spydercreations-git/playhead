package plans

// Storage constants in integer bytes
const (
	KB int64 = 1024
	MB int64 = 1024 * KB
	GB int64 = 1024 * MB
	TB int64 = 1024 * GB

	// Plan storage amounts
	TrialStorageTotal      int64 = 25 * GB
	ProStoragePerSeat      int64 = 250 * GB
	TeamStoragePerSeat     int64 = 500 * GB
	CompanyStoragePerSeat  int64 = 1 * TB
	StorageBlockBytes      int64 = 1 * TB

	// Max upload file sizes
	TrialMaxFileSize   int64 = 5 * GB
	ProMaxFileSize     int64 = 50 * GB
	TeamMaxFileSize    int64 = 100 * GB
	CompanyMaxFileSize int64 = 250 * GB
)

// Pricing in integer cents (USD)
const (
	TrialPricePerSeatMonthly   int64 = 0
	ProPricePerSeatMonthly     int64 = 1500 // $15.00
	TeamPricePerSeatMonthly    int64 = 2500 // $25.00
	CompanyPricePerSeatMonthly int64 = 4000 // $40.00
	StorageBlockPriceMonthly   int64 = 3500 // $35.00

	// Annual billing is 10x monthly price (2 months free)
	AnnualMultiplier int64 = 10

	// Minimum seats per plan
	TrialMinSeats   = 1
	TrialMaxSeats   = 5 // 14-day trial capped at 5 members
	ProMinSeats     = 1
	TeamMinSeats    = 3
	CompanyMinSeats = 5
)

// Plan identifiers
const (
	PlanTrial   = "trial"
	PlanPro     = "pro"
	PlanTeam    = "team"
	PlanCompany = "company"
)

// Feature identifiers
type Feature string

const (
	FeatureCoreMedia          Feature = "core_media"          // projects, folders, uploads, review, versions
	FeatureShareLinks         Feature = "share_links"         // password and expiry
	FeatureBoards             Feature = "boards"              // table view
	FeatureBoardAutomations   Feature = "board_automations"
	FeatureRequestFilesLinks  Feature = "request_files_links"
	FeatureVersionCompare     Feature = "version_compare"
	FeatureProjectPermissions Feature = "project_permissions"
	FeatureBrandedSharePages  Feature = "branded_share_pages" // logo, brand colour
	FeatureVerifiedBadge      Feature = "verified_badge"
	FeatureMadeWithPlayhead   Feature = "made_with_playhead"  // watermark on share pages
)

// PlanDefinition holds plan constraints
type PlanDefinition struct {
	ID                 string
	Name               string
	MonthlySeatPrice   int64 // cents
	AnnualSeatPrice    int64 // cents
	MinSeats           int
	MaxSeats           int   // 0 = unlimited, >0 = strict cap (e.g. 5 for trial)
	StoragePerSeat     int64 // bytes (for trial: total storage)
	MaxFileSizeBytes   int64
	Features           map[Feature]bool
}

var allPlans = map[string]PlanDefinition{
	PlanTrial: {
		ID:               PlanTrial,
		Name:             "Trial",
		MonthlySeatPrice: TrialPricePerSeatMonthly,
		AnnualSeatPrice:  TrialPricePerSeatMonthly * AnnualMultiplier,
		MinSeats:         TrialMinSeats,
		MaxSeats:         TrialMaxSeats,
		StoragePerSeat:   TrialStorageTotal,
		MaxFileSizeBytes: TrialMaxFileSize,
		Features: map[Feature]bool{
			FeatureCoreMedia:          true,
			FeatureShareLinks:         true,
			FeatureBoards:             true,
			FeatureBoardAutomations:   true,
			FeatureRequestFilesLinks:  true,
			FeatureVersionCompare:     true,
			FeatureProjectPermissions: true,
			FeatureBrandedSharePages:  false,
			FeatureVerifiedBadge:      false,
			FeatureMadeWithPlayhead:   true,
		},
	},
	PlanPro: {
		ID:               PlanPro,
		Name:             "Pro",
		MonthlySeatPrice: ProPricePerSeatMonthly,
		AnnualSeatPrice:  ProPricePerSeatMonthly * AnnualMultiplier,
		MinSeats:         ProMinSeats,
		StoragePerSeat:   ProStoragePerSeat,
		MaxFileSizeBytes: ProMaxFileSize,
		Features: map[Feature]bool{
			FeatureCoreMedia:          true,
			FeatureShareLinks:         true,
			FeatureBoards:             true,
			FeatureBoardAutomations:   false,
			FeatureRequestFilesLinks:  false,
			FeatureVersionCompare:     false,
			FeatureProjectPermissions: false,
			FeatureBrandedSharePages:  false,
			FeatureVerifiedBadge:      false,
			FeatureMadeWithPlayhead:   true,
		},
	},
	PlanTeam: {
		ID:               PlanTeam,
		Name:             "Team",
		MonthlySeatPrice: TeamPricePerSeatMonthly,
		AnnualSeatPrice:  TeamPricePerSeatMonthly * AnnualMultiplier,
		MinSeats:         TeamMinSeats,
		StoragePerSeat:   TeamStoragePerSeat,
		MaxFileSizeBytes: TeamMaxFileSize,
		Features: map[Feature]bool{
			FeatureCoreMedia:          true,
			FeatureShareLinks:         true,
			FeatureBoards:             true,
			FeatureBoardAutomations:   true,
			FeatureRequestFilesLinks:  true,
			FeatureVersionCompare:     true,
			FeatureProjectPermissions: true,
			FeatureBrandedSharePages:  false,
			FeatureVerifiedBadge:      false,
			FeatureMadeWithPlayhead:   true,
		},
	},
	PlanCompany: {
		ID:               PlanCompany,
		Name:             "Company",
		MonthlySeatPrice: CompanyPricePerSeatMonthly,
		AnnualSeatPrice:  CompanyPricePerSeatMonthly * AnnualMultiplier,
		MinSeats:         CompanyMinSeats,
		StoragePerSeat:   CompanyStoragePerSeat,
		MaxFileSizeBytes: CompanyMaxFileSize,
		Features: map[Feature]bool{
			FeatureCoreMedia:          true,
			FeatureShareLinks:         true,
			FeatureBoards:             true,
			FeatureBoardAutomations:   true,
			FeatureRequestFilesLinks:  true,
			FeatureVersionCompare:     true,
			FeatureProjectPermissions: true,
			FeatureBrandedSharePages:  true,
			FeatureVerifiedBadge:      true,
			FeatureMadeWithPlayhead:   false,
		},
	},
}

// Get returns the plan definition by plan ID, defaulting to Trial if invalid.
func Get(planID string) PlanDefinition {
	p, ok := allPlans[planID]
	if !ok {
		return allPlans[PlanTrial]
	}
	return p
}

// Has checks if a plan has access to a given feature.
func Has(planID string, feature Feature) bool {
	p := Get(planID)
	return p.Features[feature]
}

// CalculateStorageLimit computes storage limit in integer bytes according to Section 7.3:
// companies.storage_limit_bytes = plan storage x seats + storage blocks.
// For trial, storage is fixed at 25 GB total.
func CalculateStorageLimit(planID string, seats int, storageBlocks int) int64 {
	p := Get(planID)
	if seats < p.MinSeats {
		seats = p.MinSeats
	}
	if storageBlocks < 0 {
		storageBlocks = 0
	}

	var baseStorage int64
	if planID == PlanTrial {
		baseStorage = TrialStorageTotal
	} else {
		baseStorage = p.StoragePerSeat * int64(seats)
	}

	extraStorage := int64(storageBlocks) * StorageBlockBytes
	return baseStorage + extraStorage
}

// MaxFileSize returns the maximum allowed file upload size in integer bytes.
func MaxFileSize(planID string) int64 {
	return Get(planID).MaxFileSizeBytes
}

// MaxSeats returns the maximum seats allowed for the plan (0 if unlimited, 5 for trial).
func MaxSeats(planID string) int {
	return Get(planID).MaxSeats
}
