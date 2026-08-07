# Trustless Action Platform Backend (off-chain)

This application implements the off-chain section of the trustless action platform.

---

## Project Overview

This application includes:

* FastAPI configuration
* Docker containerization
* Dynamic Reputation Threshold Calculation

---

## Prerequisite

1. Following the Instruction on [onchain setup](https://github.com/marcokenata-1/trustless-action-platform/tree/main) to run the blockchain node locally

2. Run the following commands

```bash
cp .env.example .env
```

3. COPY one of the Address and Private key to `.env` file created in Step 2.

---

## Usage

To run the offchain service, Change directory to backend/trustless-action-platform before running the application 

To change the directory, run the following command below in your terminal

```bash
cd /backend/trustless-action-platform
```

To start the application, run the provided shell script from your terminal:

```bash
./run_app.sh
```

If permission denied, you can run the code below on terminal with the same directory.

```bash
chmod +x ./run_app
```
