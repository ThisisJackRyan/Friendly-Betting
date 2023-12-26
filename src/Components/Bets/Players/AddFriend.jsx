
import React, { useState } from 'react';

const AddFriend = (props) => {
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
    if(name !== "" && email !== "" && phone !== ""){
      props.addNewPlayers({
        "name": name,
        "email": email,
        "phone": phone
      })
    }
    // Handle form submission here
    // You can access the values using the state variables (accountNumber, phone, email, name)
  };


  return (
    <form className="addFiendForm"onSubmit={handleSubmit}>
      <div className='x'><span onClick={props.disable}>x</span></div>
      <label>
        <span>Account Number:</span>
        <input type="text" value={accountNumber} onChange={handleAccountNumberChange} />
      </label>
      <br />
      <br />
      <div className="or">or</div>
      <br />
      <label>
        <span>Name:</span>
        <input type="text" value={name} onChange={handleNameChange} />
      </label>
      <br />
      <label>
        Email:
        <input type="text" value={email} onChange={handleEmailChange} />
      </label>
      <br />
      <label>
        <span>Phone:</span>
        <input type="text" value={phone} onChange={handlePhoneChange} />
      </label>
      <br />
      <button type="submit" >Add Friend</button>
    </form>
  );
};

export default AddFriend;
