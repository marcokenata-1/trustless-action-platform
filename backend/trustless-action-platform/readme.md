# Trustless Action Platform Backend (off-chain)

This application implements the off-chain section of the trustless action platform.

---

## Project Overview

This application includes:

*   FastAPI configuration
*   Docker containerization
*   SQLAlchemy models (not finalized)

---

## Usage

To start the application, run the provided shell script from your terminal:

```bash
./run_app.sh
```

If permission denied, you can run the code below on terminal with the same directory.

```bash
chmod +x ./run_app
```

## Needed Modifications
--- 

**Database Credentials**: Ensure the application points to the correct database host and uses secure credentials. 
You can modify database credentials in `config.py` by changing variables that start with database, such as `database_url`, `database_user`, `database_password`, and `database_name`.

**Database Model Infrastructure**: The database structure itself hasn't been finalized.
