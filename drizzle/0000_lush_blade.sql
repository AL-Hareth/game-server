CREATE TABLE "cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"mainWord" varchar(255) NOT NULL,
	"wrongWords" varchar(255) NOT NULL,
	"approved" boolean DEFAULT false NOT NULL
);
