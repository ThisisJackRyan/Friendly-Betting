
import React, { useState } from 'react';

const AddFriend = () => {
  const [accountNumber, setAccountNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const handleAccountNumberChange = (e) => {
    setAccountNumber(e.target.value);
  };

  const handlePhoneChange = (e) => {
    setPhone(e.target.value);
  };

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
  };

  const handleNameChange = (e) => {
    setName(e.target.value);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle form submission here
    // You can access the values using the state variables (accountNumber, phone, email, name)
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Account Number:
        <input type="text" value={accountNumber} onChange={handleAccountNumberChange} />
      </label>
      <br />
      <br />
      <div className="or">or</div>
      <br />
      <label>
        Phone:
        <input type="text" value={phone} onChange={handlePhoneChange} />
      </label>
      <br />
      <label>
        Email:
        <input type="text" value={email} onChange={handleEmailChange} />
      </label>
      <br />
      <label>
        Name:
        <input type="text" value={name} onChange={handleNameChange} />
      </label>
      <br />
      <button type="submit">Add Friend</button>
    </form>
  );
};

export default AddFriend;
