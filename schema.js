"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cards = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.cards = (0, pg_core_1.pgTable)('cards', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    mainWord: (0, pg_core_1.varchar)('mainWord', { length: 255 }).notNull(),
    wrongWords: (0, pg_core_1.varchar)('wrongWords', { length: 255 }).notNull(), // csv
    approved: (0, pg_core_1.boolean)('approved').notNull().default(false),
    category: (0, pg_core_1.varchar)('category', { length: 255 }).notNull(),
});
