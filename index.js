
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_Password}@cluster0.wcellxl.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Async function to connect to MongoDB
async function run() {
  try {
    console.log('✅ Connected to MongoDB');

    const db = client.db('Personal_Finance_Management_App');
    const addCollection = db.collection('add');
    const userCollection = db.collection('user');

    // GET overview (total income, expense, balance)
    app.get('/transactions/overview', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email)
          return res.status(400).send({ message: 'Email is required' });

        const result = await addCollection
          .aggregate([
            { $match: { email } },
            {
              $group: {
                _id: '$type',
                total: { $sum: '$amount' },
              },
            },
          ])
          .toArray();

        let totalIncome = 0;
        let totalExpense = 0;

        result.forEach((item) => {
          if (item._id === 'income') totalIncome = item.total;
          if (item._id === 'expense') totalExpense = item.total;
        });

        const balance = totalIncome - totalExpense;

        res.send({ totalIncome, totalExpense, balance });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error' });
      }
    });

    // GET all transactions by user emailk
    app.get('/transactions', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email)
          return res.status(400).send({ message: 'Email is required' });

        const transactions = await addCollection
          .find({ email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(transactions);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error' });
      }
    });
    // GET total by category
    app.get('/transactions/category-total', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email)
          return res.status(400).send({ message: 'Email is required' });

        const totals = await addCollection
          .aggregate([
            { $match: { email } },
            { $group: { _id: '$category', total: { $sum: '$amount' } } },
          ])
          .toArray();

        res.send(totals);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error' });
      }
    });
    // GET transaction by ID
    app.get('/transactions/:id', async (req, res) => {
      try {
        const transaction = await addCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!transaction)
          return res.status(404).send({ message: 'Transaction not found' });
        res.send(transaction);
      } catch (error) {
        console.error(error);
        res.status(400).send({ message: 'Invalid ID' });
      }
    });

    // POST create transaction
    app.post('/transactions', async (req, res) => {
      try {
        const transaction = req.body;
        if (!transaction.email || !transaction.amount || !transaction.type) {
          return res.status(400).send({ message: 'Invalid data' });
        }

        transaction.amount = Number(transaction.amount);
        transaction.date = transaction.date
          ? new Date(transaction.date)
          : new Date();
        transaction.createdAt = new Date();

        const result = await addCollection.insertOne(transaction);
        res.send({
          insertedId: result.insertedId,
          acknowledged: result.acknowledged,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error' });
      }
    });

    // PUT update transaction
    app.put('/transactions/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = { ...req.body };
        delete updatedData._id;

        if (updatedData.amount) updatedData.amount = Number(updatedData.amount);
        if (updatedData.date) updatedData.date = new Date(updatedData.date);

        const result = await addCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        if (result.matchedCount === 0)
          return res.status(404).send({ message: 'Transaction not found' });

        res.send({ message: 'Transaction updated successfully' });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error' });
      }
    });

    // DELETE transaction
    app.delete('/transactions/:id', async (req, res) => {
      try {
        const result = await addCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        if (result.deletedCount === 0)
          return res.status(404).send({ message: 'Transaction not found' });

        res.send({ message: 'Transaction deleted successfully' });
      } catch (error) {
        console.error(error);
        res.status(400).send({ message: 'Invalid ID' });
      }
    });

    // GET user by email
    app.get('/users/by-email', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email)
          return res.status(400).send({ message: 'Email is required' });

        const user = await userCollection.findOne({ email });
        if (!user) return res.status(404).send({ message: 'User not found' });

        res.send({
          _id: user._id,
          firstName: user.firstName,
          email: user.email,
          imgUrl: user.imgUrl,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt || null,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error' });
      }
    });

    // POST create/update user
    app.post('/users', async (req, res) => {
      try {
        const { firstName, email, password, imgUrl } = req.body;
        if (!firstName || !email || !imgUrl)
          return res.status(400).send({ message: 'All fields are required' });

        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
          // Update existing user
          await userCollection.updateOne(
            { email },
            {
              $set: {
                firstName,
                imgUrl,
                password: password || existingUser.password,
                updatedAt: new Date(),
              },
            }
          );
          return res.send({
            message: 'User updated successfully',
            insertedId: existingUser._id,
          });
        }

        const newUser = {
          firstName,
          email,
          password,
          imgUrl,
          createdAt: new Date(),
        };
        const result = await userCollection.insertOne(newUser);
        res.send({
          message: 'User created successfully',
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error' });
      }
    });
  } catch (error) {
    console.error('❌ MongoDB Error:', error);
  }
}

// Run MongoDB connection and routes
run().catch(console.dir);

// Test routes
app.get('/', (req, res) => res.send('Server is running fine..'));


// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
