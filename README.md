# Worker + SQLite 🏪

### Setup
To use, you must provide:
1. The path to your schema file
2. The path and filename for your database. (If database file is not provided, one will be created)

Note: File paths are relative to the root of your project
```
import { DB } from './db.js'
const db = new DB('./schemas/schema.sql','./db/test_db.db')
```