import React from 'react';
import Buttons from '../../Components/Buttons';
import Modal from './components/Modal';
import { CSSTransition } from 'react-transition-group';
import { useState } from 'react';


const ViewMoneyLine = ({bets}) => {
    const [displayModal, setDisplayModal] = useState(false);

    const handleModal = () => {
        setDisplayModal(!displayModal);
    }
    return (     
        <div className="">
            <div className='blob'>
                <div className='flex flex-col gap-4 text-center text-2xl'>
                    <div>
                        <div>
                            {bets.contestant1}
                        </div>
                        {
                            bets.favorite === bets.contestant1 ? <span className='text-sm'>* Favorite according to the creator</span> : null
                        }
                    </div>
                    <div className='text-lg'>or</div>
                    <div>
                        <div>
                            {bets.contestant2}
                        </div>
                        {
                            bets.favorite === bets.contestant2 ? <span className='text-sm'>* Favorite according to the creator</span> : null
                        }
                        
                    </div>
                    <div className='flex justify-center mt-6'>
                        <button className='betButton  rounded-md cursor-pointer' onClick={handleModal}>Place Bet</button>
                    </div>  
                </div>
            </div>

            <CSSTransition
                        in={displayModal}
                        timeout={300}
                        classNames="fadeUp"
                        unmountOnExit              
                    >
                        <Modal handleModal={handleModal} contestant1={bets.contestant1} contestant2={bets.contestant2}/>
                    </CSSTransition>




            {/* <div className="blob">
                <div className="flex">
                    <div className='flex flex-col gap-8 m-4 items-center'>
                        <Buttons text="Bet" a="betButton" size="big"></Buttons>
                        <Buttons text="Bet" a="betButton" size="big"></Buttons>
                    </div>
                    <div className='flex flex-col gap-8 m-4 items-center'>
                        <div className='py-4'>{bets.contestant1}</div>
                        <div className='py-4'>{bets.contestant2}</div>
                    </div>
                    <div className='flex flex-col gap-8 m-4 items-center'>
                        {bets.contestant1Odds > 0 ? <p className='green flex justify-center bg-blue-gray w-full rounded-md p-4'>(+{bets.contestant1Odds})</p> : <p className="red  flex justify-center bg-blue-gray w-full rounded-md p-4">({bets.contestant1Odds})</p>}
                        {bets.contestant2Odds > 0 ? <p className='green flex justify-center bg-blue-gray w-full rounded-md p-4'>(+{bets.contestant2Odds})</p> : <p className='red  flex justify-center bg-blue-gray w-full rounded-md p-4'>({bets.contestant2Odds})</p>}
                    </div>
                </div>
            </div> */}
        </div> 
    );
};

export default ViewMoneyLine;
