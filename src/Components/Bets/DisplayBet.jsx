import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {getCollectionName} from '../../Config/base';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../Config/firebase-config';


const DisplayBet = ({bet}) => {

    const [betType, setBetType] = useState('')
    const [betData, setBetData] = useState({})

    useEffect(() => {
        setBetType(getCollectionName(bet.type));
        const fetchBetData = async () => {  
            const docRef = doc(db,  getCollectionName(bet.type), bet.betID);
            const docSnap = await getDoc(docRef);
            setBetData(docSnap.data());
        }
        fetchBetData();
        
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (

        <div>
            <Link
                to={`/Friendly-Betting/Bet/${betType}/${bet.id}/`}
                state={{"bet":bet}}
            >
                <div className=''>
                    <div className='bg-spring-green-light m-2 mb-4 p-2 pb-4 rounded-md box-shadow' key={bet.id}>
                        <div className='text-md font-light'>{bet.type}</div>
                        <div className='text-2xl p-2 font-medium text-center'>{bet.bet}</div>
                    </div>
                </div>
            </Link>
            
        </div>
    );
}

export default DisplayBet;