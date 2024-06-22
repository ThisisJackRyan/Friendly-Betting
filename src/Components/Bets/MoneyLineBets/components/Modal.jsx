import React from 'react';
import { IconContext } from "react-icons";
import { IoIosCloseCircle } from "react-icons/io";

const Modal = (props) => {

    return (
        <div className='absolute bottom-0 inset-x-0 w-full'>
            <IconContext.Provider value={{ color: "#BEDEC5", className: "text-4xl  cursor-pointer" }}>
                <div className="flex justify-end">
                    <IoIosCloseCircle onClick={props.handleModal}/>
                </div>
            </IconContext.Provider>
            <div className='px-4 pb-28 pt-12 bg-spring-green-light'>
                <div className='text-center'>
                    <span className='border-bottom-dashed-blue-gray text-3xl font-medium'>Place Your Bet</span>
                </div>
                <div className=' flex flex-col pt-4 gap-6 m-4 text-2xl'>
                    <div className='w-1/2 m-auto'>
                        <button className='baseBetButton w-full rounded-md'>
                            {props.contestant1}
                        </button>
                    </div>
                    <div className='text-center'>or</div>
                    <div className='w-1/2 m-auto'>
                        <button className='baseBetButton  w-full rounded-md'>
                            {props.contestant2}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Modal;