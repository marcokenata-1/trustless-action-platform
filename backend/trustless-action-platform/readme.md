# Trustless Action Platform Backend (off-chain)

This application implements the off-chain backend for the trustless action platform. Its primary function is to dynamically calculate the reputation required to create a movement.

This dynamic threshold acts as a dual-layer security shield. It evaluates the network using a Scaled Floor Model, taking the maximum of two values: a Sybil-resistant baseline (which scales logarithmically as the total user count grows) and a Pareto-adjusted average (which prevents user who has very high reputation to monopolize the requirement) which guarantees a fair, bot-proof ecosystem where everyday active users can still participate as creators.

---

## Formula

$$ \text{Threshold} = \max \left( \lfloor \log_{10}(\text{userCount}) \times B \rfloor, \lfloor \text{averageReputation} \times \text{averageFraction} \rfloor \right) $$

**Where:**

* **`userCount`**: The total number of users currently on the platform.
* **`B` (Base Multiplier)**: A hardcoded constant that dictates how steeply the minimum requirement scales as the network grows. B is set up to 10 in this application
* **`averageReputation`**: The global average reputation score of all users.
* **`averageFraction`**: A fractional multiplier used to adjust the average down, preventing elite users (with extremely high reputation) to monopolize the requirement. fraction is currently set to 0.8 (80% of average reputation)
* **`floor` ($\lfloor \rfloor$)**: Rounds the resulting calculation down to the nearest whole integer.

---

## How is this calculation included in the system

- **Fetch Data** : This application received total number of users (`userCount`) and average of reputation across all users (`averageReputation`) from on-chain Reputation Contract.
- **Calculation** : Calculate the threshold to determine reputation required to create a movement
- **Update Threshold** : The calculated threshold will send to requirementUpdater in Movement Contract via `setCreateRequirement`

---

## Project Overview

This application includes:

* FastAPI configuration
* Docker containerization
* Dynamic Reputation Threshold Calculation (Implemented in `/routers/movements.py`)

---

## Prerequisite

1. Following the Instruction on [onchain setup (Step 2 and 3)](https://github.com/marcokenata-1/trustless-action-platform/blob/main/readme.txt) to run the blockchain node locally
2. Run the following commands

```bash
cp .env.example .env
```

3. COPY one of the Address and Private key from Step 1 to `.env` file created in Step 2.

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

## Accessing the Application

Once the application is successfully running, the FastAPI server will be accessible locally at:

- URL : http://localhost:8000
- API Documentation : http://locahost:8000/docs
