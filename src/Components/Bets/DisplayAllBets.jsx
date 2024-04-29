import React from 'react';
import { useState, useEffect } from 'react';
import {db} from '../../Config/firebase-config';
import { collection, getDocs } from 'firebase/firestore';
import DisplayBet from './DisplayBet';
import { getSignedInUserInfo } from '../../Config/base';


const DisplayAllBets = () => {
    const [bets, setBets] = useState([])


    useEffect(() => {
      const getBets = async () => {
        try{
          const data = await getDocs(collection(db, "bets"));
          const filteredData = data.docs.map(doc => ({
            ...doc.data(), 
            id: doc.id,
          }));
          const cleanedData = filteredData.filter(bet => bet.createdByID === getSignedInUserInfo().uid);
          setBets(cleanedData);
        } catch (e) {
          console.error(e);
        }
      }
      
      getBets();
    }, [])

  return (
    <div className='flex justify-center p-12'>

      {bets.length < 1 ? (
        <div>
          <h3>hmmm.... Looks Like you haven't created any bets yet 🤷‍♂️ </h3>
          <p> Create One!</p>

        </div>
      ) : (
        <div>
          {bets.map((bet, id) => (
            <DisplayBet key={id} bet={bet} />
          ))}
        </div>
      ) }
    </div>
  );
}

export default DisplayAllBets;
