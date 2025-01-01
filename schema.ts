import { boolean, pgTable, serial, varchar } from 'drizzle-orm/pg-core';

export const cards = pgTable('cards', {
  id: serial('id').primaryKey(),
  mainWord: varchar('mainWord', { length: 255 }).notNull(),
  wrongWords: varchar('wrongWords', { length: 255 }).notNull(), // csv
  approved: boolean('approved').notNull().default(false),
  category: varchar('category', { length: 255 }).notNull(),
});
