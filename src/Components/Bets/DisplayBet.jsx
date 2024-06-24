import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {getCollectionName} from '../../Config/base';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../Config/firebase-config';


const DisplayBet = (props) => {

    const [betType, setBetType] = useState('')
    const [betData, setBetData] = useState({})

    useEffect(() => {
        setBetType(getCollectionName(props.bet.type));
        const fetchBetData = async () => {  
            const docRef = doc(db,  getCollectionName(props.bet.type), props.bet.betID);
            const docSnap = await getDoc(docRef);
            setBetData(docSnap.data());
        }
        fetchBetData();
        
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (

        <div>
            <Link
                to={`/Friendly-Betting/Bet/${betType}/${props.bet.id}/`}
                state={{"bet":props.bet}}
            >
                <div className=''>
                    <div className='bg-spring-green-light m-2 mb-4 p-2 pb-4 rounded-md box-shadow' key={props.bet.id}>
                        <div className='text-md font-light'>{props.bet.type}</div>
                        <div className='text-2xl p-2 font-medium text-center'>{props.bet.bet}</div>
                    </div>
                </div>
            </Link>
            
        </div>






        // <div className='max-w-3xl'>
        //     <Link 
        //         to={`/Friendly-Betting/Bet/${betType}/${props.bet.id}/`}
        //         state={{"bet":props.bet}}
        //         className="text-black no-underline"
            
        //     >
        //         <div className="flex justify-between box-shadow bg-spring-green-light rounded-2xl p-4 m-4">
        //             <div className="flex flex-col gap-6 max-w-sm"key={props.bet.id}>
        //                 <div>{props.bet.type}</div>
        //                 <div className='text-2xl font-bold text-center pl-8'>{props.bet.bet}</div>
        //                 <div className='text-lg pl-8'>
        //                     {betData.line ? "Line " + betData.line : 
        //                     betData.options ?  betData.options.length + " Options" :
        //                     ""
        //                     }
        //                     </div>
        //                 <div className='text-sm pl-8'>Created by <span className='font-semibold'>{props.bet.createdByEmail}</span></div>
        //             </div>
        //             <div>
        //                 <div className={`flex`}>
        //                     <div className={`flex flex-col p-2 m-2  ${css.line}`}>
        //                         <div className='flex  justify-center items-center p-4 font-semibold'>{betData.contestant1 || betData.options || "Over"}</div>
        //                         <div className='flex justify-center items-center p-4 pb-0 font-light'> {betData.over || 27} Bets</div>
        //                     </div>
        //                     <div className='flex flex-col p-2 m-2'>
        //                         <div className='flex justify-center items-center p-4 font-semibold'>{betData.contestant2 || betData.options || "Under"}</div>
        //                         <div className='flex justify-center items-center p-4 pb-0 font-light'>{betData.under || 23} Bets</div>
        //                     </div>
        //                 </div>
        //                 <div className='flex justify-center items-center p-4 font-light'>{betData.over + betData.under || 50} Bets placed</div>
        //             </div>
        //         </div>
        //     </Link>
        // </div>
    );
}

export default DisplayBet;