import React from 'react';
import { useState, useEffect } from 'react';
import {db} from '../../Config/firebase-config';
import { collection, getDocs } from 'firebase/firestore';
import DisplayBet from './DisplayBet';
import { getSignedInUserInfo } from '../../Config/base';
import { CSSTransition } from 'react-transition-group';
import BetNav from './BetNav';


const DisplayAllBets = () => {
    const [bets, setBets] = useState([])
    const [display, setDisplay] = useState(false)

    const swapDisplay = () => {
        setDisplay((current) => !current)
    }


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
    <div className='flex flex-col justify-center p-12'>

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
      <div className="flex justify-center items-center bg-blue-gray text-white mx-2 rounded-md box-shadow py-4" onClick={swapDisplay}>
          Create Bet
      </div>

      <CSSTransition
                in={display}
                timeout={300}
                classNames="fadeUp"
                unmountOnExit              
      >
        <BetNav swap={swapDisplay}/>
      </CSSTransition>
    </div>
  );
}

export default DisplayAllBets;
