ALTER TABLE ledo_organizations ADD COLUMN period TEXT;
--> statement-breakpoint
ALTER TABLE ledo_organizations ADD COLUMN inventory_item TEXT;
--> statement-breakpoint
ALTER TABLE ledo_organizations ADD COLUMN opening_bank INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE ledo_organizations ADD COLUMN opening_cash INTEGER NOT NULL DEFAULT 0;
